/**
 * Copyright (C) 2012-2013 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package controllers   // MOVE this file to  talkyard.server.modn

import com.debiki.core._
import debiki.JsonUtils.{parseInt32, parseSt}
import debiki.JsonMaker
import debiki.EdHttp._
import talkyard.server.http.{ApiRequest, GetRequest}
import talkyard.server.{TyContext, TyController}
import javax.inject.Inject
import play.api.libs.json._
import play.api.mvc
import play.api.mvc.{Action, ControllerComponents}
import talkyard.server.JsX.{JsEmptyObj, JsPageMetaBrief, JsUser}


/** Lists posts for the moderation page, and approves/rejects/deletes posts
  * that are new or have been flagged.
  *
  * BUG race condition, the lost update bug: The admin might e.g. clear flags s/he hasn't seen,
  * namely flags created after s/he loaded the admin page. Fix things like this by sending
  * a post version number to the server and most-recent-seen-flag date?
  *
  * SECURITY (minor) SHOULD not log errors, but just reply 403 Forbidden, if calling these fns
  * for guests, when not allowed. (Logging errors = letting people clutter the log files with
  * crap.)
  */
class ModerationController @Inject()(cc: ControllerComponents, edContext: TyContext)
  extends TyController(cc, edContext) {

  import context.globals

  val ActionCountLimit = 100
  val PostTextLengthLimit = 500

  // Approving new mebmers:
  // See   /-/edit-member   controllers.UserController.editMember

  def loadReviewTasks: Action[Unit] = StaffGetAction { request =>
    loadReviewTasksdReplyJson(request)
  }


  private def loadReviewTasksdReplyJson(request: ApiRequest[_]): mvc.Result = {
    val (reviewStuff, reviewTaskCounts, usersById, pageMetaById) = request.dao.loadReviewStuff(
      olderOrEqualTo = None, limit = 100, request.who)
    OkSafeJson(
      Json.obj(
        "reviewTasks" -> JsArray(reviewStuff.map(JsonMaker.reviewStufToJson)),
        "reviewTaskCounts" -> Json.obj(
          "numUrgent" -> reviewTaskCounts.numUrgent,
          "numOther" -> reviewTaskCounts.numOther),
        // [missing_tags_feats] load user badges too, and page tags
        // And change to "pats".
        "users" -> usersById.values.map(JsUser(_, inclSuspendedTill = true)),
        "pageMetasBrief" -> pageMetaById.values.map(JsPageMetaBrief)))
  }


  def makeReviewDecision: Action[JsValue] = StaffPostJsonAction(maxBytes = 100) { request =>
    val taskId = (request.body \ "taskId").as[ReviewTaskId]
    val anyRevNr = (request.body \ "revisionNr").asOpt[Int]
    val decisionInt = (request.body \ "decision").as[Int]
    val decision = ReviewDecision.fromInt(decisionInt) getOrElse throwBadArgument("EsE5GYK2", "decision")
    request.dao.makeReviewDecisionIfAuthz(taskId, request.who, anyRevNr = anyRevNr, decision)
    loadReviewTasksdReplyJson(request)
  }


  def tryUndoReviewDecision: Action[JsValue] = StaffPostJsonAction(maxBytes = 100) { request =>
    val taskId = (request.body \ "taskId").as[ReviewTaskId]
    val couldBeUndone = request.dao.tryUndoReviewDecisionIfAuthz(taskId, request.who)
    // OkSafeJson(Json.obj("couldBeUndone" -> couldBeUndone))  CLEAN_UP remove couldBeUndone in client/app/ too.
    loadReviewTasksdReplyJson(request)
  }


  def moderateFromPage: Action[JsValue] = StaffPostJsonAction(maxBytes = 100) { request =>
    import request.{dao, body}
    // Tests:
    // - modn-from-disc-page-appr-befr.2browsers.test.ts  TyTE2E603RTJ
    // - modn-ban-from-disc-page.2br.f  TyTEBANFROMDISC.TyTMODN_SUSPLS
    // - tags-badges-not-missing.2br  TyTETAGS0MISNG.TyTAPRTGDPO

    // In the response, we'll include only changes visible on `curPageId`, so the
    // mod won't find out about things han maybe cannot see. We'll also
    // verify that `postId` is indeed located on `curPageId`.
    val curPageId = parseSt(body, "pageId")
    val postId = parseInt32(body, "postId")
    val postRevNr = parseInt32(body, "postRevNr")
    val decisionInt = parseInt32(body, "decision")
    val decision = ReviewDecision.fromInt(decisionInt).getOrThrowBadRequest(
          "TyE05RKJTR3", s"Bad review decision int: $decisionInt")

    throwBadRequestIf(
          decision != ReviewDecision.Accept
            && decision != ReviewDecision.DeletePostOrPage
            && decision != ReviewDecision.DeleteAndBanSpammer,
          "TyE305RKDJ3",
          s"That decision not allowed here: $decision")

    // (If `postId` isn't on page `curPageId`, or if the mod cannot see post `postId`,
    // this'll throw Forbidden.)
    val modResult = dao.moderatePostInstantly(pageId = curPageId, postId = postId,
          postRevNr = postRevNr, decision, moderator = request.theRequester)

    // Don't show what happened to posts on other pages, if any.  Maybe the mod isn't
    // allowed to see some other page with, say, [a comment by a spammer now getting banned]
    // — maybe an admin just moved such a page to a category the mod can't see  [mods_cant_see]
    // (although unlikely).
    val updatedPostsSamePage: Seq[Post] =
          modResult.updatedPosts.filter(p => p.pageId == curPageId)

    var patchJson = {
      if (updatedPostsSamePage.nonEmpty) {
        val postIds = updatedPostsSamePage.map(_.id).toSet
        dao.jsonMaker.makeStorePatchForPostIds(
              postIds, showHidden = true, inclUnapproved = true,
              // Or can this in some rare cases accidentally un-squash some squashed comments
              // on a large page? Pretty harmless. [in_full_or_not]
              maySquash = false,
              dao)
      }
      else {
        JsEmptyObj
      }
    }

    // Don't show if other pages the mod maybe can't see, got deleted. [mods_cant_see]
    val deletedPageIdsSamePage: Set[PageId] = modResult.deletedPageIds.filter(_ == curPageId)

    if (deletedPageIdsSamePage.nonEmpty) {  // [62AKDN46]
      patchJson = dao.jsonMaker.addStorePatchDeletePages(
            patchJson, deletedPageIdsSamePage, globals.applicationVersion)
    }

    OkSafeJson(patchJson)
  }


  /*
  def hideNewPostSendPm
  def hideFlaggedPostSendPm =
    ??? // request.dao.hidePostClearFlag(pageId, postId = postId, hiddenById = request.theUserId)
  def deletePost
    request.dao.deletePost(pageId, postNr = postNr, deletedById = request.theUserId,
        request.theBrowserIdData)

  def deleteFlaggedPost
    // COULD add a specific method deleteFlaggedPost, that also ... marks the flags as accepted?
    // Like Discourse does it. For now:
    val PagePostNr(pageId, postNr) = parseBody(request)
    request.dao.deletePost(pageId, postNr = postNr, deletedById = request.theUserId,
        request.theBrowserIdData)

  def clearFlags =
    request.dao.clearFlags(pageId, postNr = postNr, clearedById = request.theUserId)

  def rejectEdits =
    ??? // request.dao.rejectEdits(pageId, postId = postId, rejectedById = request.theUserId)
  */

}

