/*
 * Copyright (c) 2014-2018 Kaj Magnus Lindberg
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

/// <reference path="../more-prelude.more.ts" />
/// <reference path="../editor/PageRoleDropdown.more.ts" />

//------------------------------------------------------------------------------
   namespace debiki2.pagedialogs {
//------------------------------------------------------------------------------

const r = ReactDOMFactories;
const DropdownModal = utils.DropdownModal;
const ExplainingListItem = util.ExplainingListItem;


interface ChangePageDiagState extends ChangePageDiagParams {
  store: Store
  isOpen: Bo
  atRect: Rect
  pullLeft?: Bo
  windowWidth?: Nr
}


let changePageDialog;

export function openChangePageDialog(atRect: Rect, props: ChangePageDiagParams) {
  if (!changePageDialog) {
    changePageDialog = ReactDOM.render(ChangePageDialog(), utils.makeMountNode());
  }
  changePageDialog.openAtFor(atRect, props);
}


// some dupl code [6KUW24]
const ChangePageDialog = createComponent({
  displayName: 'ChangePageDialog',

  mixins: [StoreListenerMixin],

  getInitialState: function () {
    return {
      isOpen: false,
      store: debiki2.ReactStore.allData(),
    } satisfies Partial<ChangePageDiagState>;
  },

  onChange: function() {
    this.setState({
      store: debiki2.ReactStore.allData(),
    } satisfies Partial<ChangePageDiagState>);
  },

  // dupl code [6KUW24]
  openAtFor: function(atRect: Rect, props: ChangePageDiagParams) {
    this.setState({
      ...props,
      isOpen: true,
      atRect,
      pullLeft: props.pullLeft ||
          props.showViewAnswerButton, // (hack) then it's the icon to the left of the title
      windowWidth: window.innerWidth,
    } satisfies Partial<ChangePageDiagState>);
  },

  close: function() {
    this.setState({
      isOpen: false,
      page: undefined,
      showViewAnswerButton: undefined,
    } satisfies Partial<ChangePageDiagState>);
  },

  render: function() {
    const state: ChangePageDiagState = this.state;
    const store: Store = state.store;
    const settings: SettingsVisibleClientSide = store.settings;
    const me: Myself = store.me;
    const isOwnPage = store_thisIsMyPage(store);  // [.store_or_state_pg]
    const isOwnOrStaff = isOwnPage || isStaff(me);
    const isOwnOrCore = isOwnOrStaff || user_isTrustMinNotThreat(me, TrustLevel.CoreMember);
    const isStaffOrTrusted = isStaff(me) || user_isTrustMinNotThreat(me, TrustLevel.Trusted);

    let anyChatPurpose: RElm | U;
    let anyViewMembersBtn: RElm | U;
    let anyEditPurposeBtn: RElm | U;
    let anyLeaveButton: RElm | U;
    let anyViewAnswerButton;
    let changeStatusTitle;
    let setNewListItem;
    let setPlannedListItem;
    let setStartedListItem;
    let setDoneListItem;
    let assignBtn: RElm | U;
    let changeCategoryListItem;
    let changeTopicTypeListItem;
    let changeComtOrderListItem;
    let changeComtNestingListItem;;
    let closeListItem;
    let reopenListItem;
    let deletePageListItem;
    let undeletePageListItem;

    // Auto close the dialog after each change, otherwise people think
    // it's broken and are unsure if the changes took effect:

    const savePage = (changes: EditPageRequestData) => {
      // E.g. EditPageRequestData.showId and .htmlTagCssClasses can be edited by admins only,
      // and should be grayed out if one is in Anon Mode for example? [alias_mode]
      // (A [pick_persona_click_handler] could save a few lines of code?)
      persona.chooseEditorPersona({ store, atRect: state.atRect, isInstantAction: true },
              (choices: DoAsAndOpts) => {
        ReactActions.editTitleAndSettings({ ...changes, doAsAnon: choices.doAsAnon },
                this.close, null);
      });
    }

    const togglePageClosed = () => {
      persona.chooseEditorPersona({ store, atRect: state.atRect, isInstantAction: true },
              (choices: DoAsAndOpts) => {
        const pageId = Server.getPageId();
        ReactActions.togglePageClosed({ pageId, doAsAnon: choices.doAsAnon }, this.close);
      });
    };

    if (state.isOpen) {
      // CLEAN_UP use only one of  state.page and  store.currentPage!
      // They're always the same, currently, but, still.
      const page: Page = state.page;   // [.store_or_state_pg]
      // @ifdef DEBUG
      dieIf(page !== store.currentPage, 'TyE50MSED257');
      // @endif

      const origPost = page.postsByNr[BodyNr];

      const isChat = page_isChat(page.pageRole);
      if (isChat) {
        anyChatPurpose = rFr({},
            // Maybe it's obvious that this text is the chat purpose? It'd typically start with
            // "Here you can ...". Could skip?  Or, show the title again, with an edit button
            // just after? And an edit button after the purpose, too?
            r.div({ className: 's_ExplDrp_Ttl n_Purp' }, t.c.Purpose), // [chat_purpose_header]
            r.div({ className: 's_ExplDrp_DescIt' },
              debiki2.page.PostBody({ store, post: origPost })));

        // A list chat members button, unless it's a joinless chat (which one doesn't need
        // to join to post messages, doesn't have members (unless type changed to joinless,
        // when there already were members, hmm)). [0_joinless_chat_members]
        anyViewMembersBtn = page.pageRole === PageRole.JoinlessChat ? null :
            r.div({ className: 's_ExplDrp_ActIt' },
              Button({
                onClick: () => {
                  // REFACTOR: Break out fn!  [break_out_view_chat_membs_fn]
                  ReactActions.setPagebarOpen(true);
                  sidebar.contextBar.showUsers();
                  setTimeout(() => { // [highl_contextbar]
                    sidebar.contextBar.highligtDuringMillis(700);
                  })
                  this.close();
                }},
                // Elsewhere, id: 'e2eWB_ViewPeopleB'
                r.span({ className: 'e_ChPgD_ViewMembB'  }, t.wb.ViewChatMembers),
                ));

        const isChatMember = me_isPageMember(me, page);

        // UX BUG, harmles: Can leave chat page, when editor open & typing a message already.
        // Then, when submitting, there's this error:  [leave_chat_ux_bug]
        //    "not a member of this chat channel [EsE4UGY7]".
        anyLeaveButton = !isChatMember ? null : r.div({ className: 's_ExplDrp_ActIt' },
            Button({
                onClick: () => {
                  Server.leavePage();
                  this.close();
                }},
                // Elsewhere, id: 'e2eWB_LeaveB'
                r.span({ className: 'e_ChPgD_LeaveB'  }, t.wb.LeaveThisChat),
                ));

        anyEditPurposeBtn = !isOwnOrStaff ? null : r.div({ className: 's_ExplDrp_ActIt' },
            Button({ className: 'e_ChPgD_EdPurpB',
                onClick: () => {
                  editor.openToEditChatTitleAndPurpose();
                  this.close();
                }},
                t.wb.EditChat));
      }

      // Ideas and Problems can be solved [tpc_typ_solv], and then
      // pat cannot change their doing status, unless un-selecting
      // the solution post.
      // Later, the [alterPage] permission will determine if pat can do this.
      const canChangeDoingStatus = isOwnOrCore &&
          page_canBeDone(page) && !page_isClosedUnfinished(page) &&
          !debiki2.page_isSolved(page);

      // Better not let Core Members do this right now — later, do allow, but
      // only if moving the page, will *not* let *more* people see it?  [core_move_page]
      // (Otherwise, they'd need to ask a moderator?)
      const canChangeCategory = isOwnOrStaff && settings.showCategories !== false &&
          store.currentCategories.length;

      const canChangePageType = isOwnOrCore && page_mayChangeRole(page.pageRole) &&
          settings_selectTopicType(settings, me);

      const alreadyDoneOrAnswered =
          page.doingStatus === PageDoingStatus.Done || page.pageAnswerPostUniqueId;

      anyViewAnswerButton = !page.pageAnsweredAtMs || !state.showViewAnswerButton ? null :
          r.div({ className: 's_ExplDrp_ActIt' },
            Button({ className: 'e_VwAnsB',
                onClick: (event) => {
                  utils.makeShowPostFn(TitleNr, page.pageAnswerPostNr)(event);
                  this.close();
                }},
              t.cpd.ViewAnswer));

      changeStatusTitle = !canChangeDoingStatus ? null :
          r.div({ className: 's_ExplDrp_Ttl' }, t.cpd.ChangeStatusC);

      setNewListItem = !canChangeDoingStatus ? null :
          ExplainingListItem({
            active:  page.doingStatus === PageDoingStatus.Discussing,
            title: r.span({ className: 'e_PgSt-New'  }, t.d.StatusNew),
            text: t.d.StatusNewDtl,
            onSelect: () => savePage({ doingStatus: PageDoingStatus.Discussing }) });

      setPlannedListItem = !canChangeDoingStatus ? null :
          ExplainingListItem({
            active: page.doingStatus === PageDoingStatus.Planned,
            title: r.span({ className: 'e_PgSt-Planned'  }, t.d.StatusPlanned),
            text: page.pageRole === PageRole.Problem ? t.d.TooltipProblPlanned : t.d.TooltipIdeaPlanned,
            onSelect: () => savePage({ doingStatus: PageDoingStatus.Planned }) });

      setStartedListItem = !canChangeDoingStatus ? null :
          ExplainingListItem({
            active: page.doingStatus === PageDoingStatus.Started,
            title: r.span({ className: 'e_PgSt-Started'  }, t.d.StatusStarted),
            text: page.pageRole === PageRole.Problem ? t.d.TooltipFixing : t.d.TooltipImplementing,
            onSelect: () => savePage({ doingStatus: PageDoingStatus.Started }) });

      setDoneListItem = !canChangeDoingStatus ? null :
          ExplainingListItem({
            active: page.doingStatus === PageDoingStatus.Done,
            title: r.span({ className: 'e_PgSt-Done'  }, t.d.StatusDone),
            text: page.pageRole === PageRole.Problem ? t.d.TooltipProblFixed : t.d.TooltipDone,
            onSelect: () => savePage({ doingStatus: PageDoingStatus.Done }) });

      // If it can be closed, it can also be assigned?  [who_can_assign]
      // (Also if it's been closed already — so can change assignee to show
      // who was assigned / did it, without having to reopen and close again.)
      const canAssign = page_canToggleClosed(page) &&
          // (Later, will use the permission system: can_assign_pats_c, can_assign_self_c.)
          isStaffOrTrusted;
      assignBtn = !canAssign ? null : rFr({},
          r.div({ className: 's_ExplDrp_Ttl' }, "Assigned to: "),   // I18N
          r.div({ className: 's_ExplDrp_ActIt' },
            !origPost.assigneeIds
                ? r.span({ className: 'c_Asg20' }, `(None)`) // I18N
                : r.ul({ className: 'c_AsgsL' }, origPost.assigneeIds.map(patId =>
                    r.li({ key: patId },
                      UserName({ patId, store, avoidFullName: true })))),
            Button({ className: 'e_AsgB', onClick: () => {
                  widgets.openAssignToDiag(origPost, store, this.close);
                }}, t.ChangeDots),
              ));

      changeCategoryListItem = !canChangeCategory ? null : rFragment({},
          r.div({ className: 's_ExplDrp_Ttl' }, t.cpd.ChangeCatC),
          r.div({ className: 's_ExplDrp_ActIt' },
            editor.SelectCategoryDropdown({
                store, selectedCategoryId: page.categoryId,
                onCategorySelected: (categoryId: CategoryId) => {
                  savePage({ categoryId });
                } })));

      changeTopicTypeListItem = !canChangePageType ? null : rFragment({},
          r.div({ className: 's_ExplDrp_Ttl' }, t.cpd.ChangeTopicTypeC),
          r.div({ className: 's_ExplDrp_ActIt' },
            editor.PageRoleDropdown({ pageRole: page.pageRole, pageExists: true, store,
                onSelect: (newType: PageRole) => {
                  savePage({ pageRole: newType });
                }})));

      changeComtOrderListItem = !isStaff(me) ? null : rFr({}, // [onl_staff_set_comt_ord]
          r.div({ className: 's_ExplDrp_Ttl' }, "Comment sort order:"),
          r.div({ className: 's_ExplDrp_ActIt' },
            widgets.DiscLayoutDropdownBtn({ page, store,
                // Don't show [temp sort order changes ("tweaks") done in this browser]
                // — instead, now, we're saving server side, for everyone.
                layoutFor: LayoutFor.PageNoTweaks, forEveryone: true,
                onSelect: (newLayout: DiscPropsSource) => {
                  savePage(newLayout);
                }})));

      changeComtNestingListItem = null;  // later

      // Show a Close button for unanswered questions and not-yet-done ideas/problems,
      // and a Reopen button if closed already.
      if (alreadyDoneOrAnswered) {
        // Page already done / has-an-accepted-answer; then, it's closed already. [5AKBS2]
      }
      else if (!page_canToggleClosed(page)) {
        // Cannot close or reopen this type of page.
      }
      else if (!isOwnOrCore) {
        // May not close other people's pages.
      }
      else if (page.pageClosedAtMs) {
        reopenListItem = rFragment({},
            r.div({ className: 's_ExplDrp_Ttl' }, t.Reopen + '?'),
            r.div({ className: 's_ExplDrp_ActIt' },
              Button({ className: 'icon-circle-empty e_ReopenPgB',
                  onClick: togglePageClosed },
                t.Reopen)));
      }
      else {
        let closeItemText: string;
        switch (page.pageRole) {
          case PageRole.Question:
            if (isOwnPage)
              closeItemText = t.pa.CloseOwnQuestionTooltip;
            else
              closeItemText = t.pa.CloseOthersQuestionTooltip;
            break;
          case PageRole.ToDo:
            closeItemText = t.pa.CloseToDoTooltip;
            break;
          default:
            closeItemText = t.pa.CloseTopicTooltip;
        }
        closeListItem = rFragment({},
            r.div({ className: 's_ExplDrp_Ttl' }, t.Close + '?'),
            r.div({ className: 's_ExplDrp_ActIt' },
              Button({ className: 'icon-block e_ClosePgB',
                  onClick: togglePageClosed },
                t.pa.CloseTopic || t.Close),  // I18N remove  || ...  once translated
              r.div({ className: 'esExplDrp_ActIt_Expl' }, closeItemText)));
      }

      if (page_isAncCatDeld(page)) {
        // Then doesn't make sense to delete or undelete the page
        // — when the whole category it's placed in, is deleted.
      }
      else if (store_canDeletePage(store)) {  // [.store_or_state_pg]
        deletePageListItem = rFr({},
            r.div({ className: 's_ExplDrp_Ttl' }, "Delete page" + '?'),  // I18N
            r.div({ className: 's_ExplDrp_ActIt' },
              DeletePageBtn({ pageIds: [page.pageId], store, close: this.close })));
      }
      else if (store_canUndeletePage(store)) {  // [.store_or_state_pg]
        undeletePageListItem = rFr({},
            r.div({ className: 's_ExplDrp_Ttl' }, "Undelete page" + '?'),  // I18N
            r.div({ className: 's_ExplDrp_ActIt' },
              DeletePageBtn({ pageIds: [store.currentPageId], store,
                    undel: true, close: this.close })));
      }
    }

    // If ever opening, although empty, that'd be a bug.  [empty_change_page_dlg]
    // (It's safe to forget to update this list — there'll be a debug build assertion failure.)
    // @ifdef DEBUG
    dieIf(state.isOpen && !(
          anyChatPurpose
          || anyViewMembersBtn
          || anyLeaveButton
          || anyEditPurposeBtn
          || anyViewAnswerButton
          || changeStatusTitle
          || setNewListItem
          || setPlannedListItem
          || setStartedListItem
          || setDoneListItem
          || assignBtn
          || changeCategoryListItem
          || changeTopicTypeListItem
          || reopenListItem
          || closeListItem
          || deletePageListItem
          || undeletePageListItem
          || changeComtOrderListItem
          || changeComtNestingListItem), 'TyEEMPYTCHAPAD');
    // @endif

    return (
      DropdownModal({ show: state.isOpen, onHide: this.close, atRect: state.atRect,
          pullLeft: state.pullLeft, windowWidth: state.windowWidth,
          showCloseButton: true, dialogClassName2: 's_ChPgD',
          allowWide: !!anyChatPurpose,
          },
        anyChatPurpose,
        anyViewMembersBtn,
        anyLeaveButton,
        anyEditPurposeBtn,
        anyViewAnswerButton,
        // If is a chat, and pat is a mod or the page owner, then, there's chat related
        // buttons above, and alter page buttons below — then, nice with a separator line
        // in between.
        isOwnOrStaff && anyChatPurpose ? r.hr() : null,
        changeStatusTitle,
        setNewListItem,
        setPlannedListItem,
        setStartedListItem,
        setDoneListItem,
        assignBtn,
        changeCategoryListItem,
        changeTopicTypeListItem,
        reopenListItem,
        closeListItem,
        deletePageListItem,
        undeletePageListItem,
        // Almost never used, could be hidden behind an Advnced button?:
        changeComtOrderListItem,
        changeComtNestingListItem,
        ));
  }
});


//------------------------------------------------------------------------------
   }
//------------------------------------------------------------------------------
// vim: fdm=marker et ts=2 sw=2 tw=0 fo=tcqwn list
