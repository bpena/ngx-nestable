import {
  Component,
  OnInit,
  Output,
  Input,
  EventEmitter,
  ViewContainerRef,
  Renderer2,
  ElementRef,
  ViewEncapsulation,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  NgZone
} from '@angular/core';

import * as helper from './nestable.helper';

import { defaultSettings, mouse } from './nestable.constant';
import { NestableSettings } from './nestable.models';

const PX = 'px';
/**
* Detect CSS pointer-events property
* events are normally disabled on the dragging element to avoid conflicts
* https://github.com/ausi/Feature-detection-technique-for-pointer-events/blob/master/modernizr-pointerevents.js
*/
const hasPointerEvents = (function () {
  const el = document.createElement('div'),
    docEl = document.documentElement;

  if (!('pointerEvents' in el.style)) { return false; }

  el.style.pointerEvents = 'auto';
  el.style.pointerEvents = 'x';
  docEl.appendChild(el);
  const supports = window.getComputedStyle && window.getComputedStyle(el, '').pointerEvents === 'auto';
  docEl.removeChild(el);
  return !!supports;
})();

@Component({
  selector: 'ngx-nestable',
  templateUrl: './nestable.component.html',
  styleUrls: ['./nestable.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NestableComponent implements OnInit, OnDestroy {

  @Output() public listChange = new EventEmitter();

  @Input() public template: ViewContainerRef;
  @Input() public options = defaultSettings;
  @Input()
  public get list() { return this._list; }
  public set list(list) {
    this._list = list;
    this._generateItemIds();
    // if (this._componentActive) {
    //   setTimeout(() => {
    //     this.reset();
    //     if (this.options.exportCollapsed) {
    //       helper._traverseChildren(this._list, item => {
    //         if (item.expanded === false) {
    //           this.collapseItem(document.getElementById(item['$$id']));
    //         }
    //       });
    //     }
    //   }, 0);
    // }
  }

  public dragRootEl = null;
  public dragEl = null;
  public moving = false;

  /**
   * Dragged element contains children, and those children contain other children and so on...
   * This property gives you the number of generations contained within the dragging item.
   */
  public dragDepth = 0;

  /**
   * The depth of dragging item relative to element root (ngx-nestable)
   */
  public relativeDepth = 0;

  public hasNewRoot = false;
  public pointEl = null;
  public items = [];

  private _componentActive = false;
  private _mouse = Object.assign({}, mouse);
  private _list = [];
  // private _options = Object.assign({}, defaultSettings) as NestableSettings;
  private _cancelMousemove: Function;
  private _cancelMouseup: Function;
  private _placeholder;
  private _itemId = 0;

  constructor(
    private ref: ChangeDetectorRef,
    private renderer: Renderer2,
    private el: ElementRef,
    private zone: NgZone
  ) {
    this._mouse = Object.assign({}, mouse);
  }

  ngOnInit() {
    this._componentActive = true;
    const optionKeys = Object.keys(defaultSettings);
    for (const key of optionKeys) {
      if (typeof this.options[key] === 'undefined') {
        this.options[key] = defaultSettings[key];
      }
    }
    this._init();

  }

  ngOnDestroy(): void {
    this._destroy();
  }

  /**
   * @deprecated
   * set mousedown listener for all DOM items, and bind remove event
   * listener functions to coresponding elements in list
   */
  private _init() {
    // setTimeout(() => {
    //   this._createDragListeners();
    //   this._createColapseListeners();
    //   if (this.options.exportCollapsed) {
    //     helper._traverseChildren(this._list, item => {
    //       if (item.expanded === false) {
    //         this.collapseItem(document.getElementById(item['$$id']));
    //       }
    //     });
    //   }
    // }, 0);

    this._generateItemIds();
  }

  /**
   * @deprecated
   */
  private _createDragListeners() {
    const itemsDom = this.el.nativeElement.getElementsByClassName(this.options.itemClass);
    for (let i = 0; i < itemsDom.length; i++) {
      if (itemsDom[i].querySelectorAll(`:scope > ${this.options.listNodeName}.${this.options.listClass}`).length
        && !itemsDom[i].querySelectorAll(`:scope > button`).length
      ) {
        itemsDom[i].insertAdjacentHTML('afterbegin', this.options.expandBtnHTML);
        itemsDom[i].insertAdjacentHTML('afterbegin', this.options.collapseBtnHTML);
      }

      this.items[i] = {
        destroy: this.renderer.listen(itemsDom[i], 'mousedown', this.dragStart.bind(this)),
        el: itemsDom[i]
      };
    }
  }

  /**
   * @deprecated
   */
  private _createColapseListeners() {
    const childButtons = this.el.nativeElement.querySelectorAll('[data-action]');
    for (let i = 0; i < childButtons.length; i++) {
      this.renderer.listen(childButtons[i], 'mousedown', e => {
        e.stopPropagation();

        const action = e.target.dataset['action'];
        if (action === 'collapse') {
          this.collapseItem(e.target.parentElement);
        }
        if (action === 'expand') {
          this.expandItem(e.target.parentElement);
        }
      });
    }
  }

  /**
   * TODO this f should return an id number so it can be used in template
   */
  private _generateItemIds() {
    helper._traverseChildren(this._list, item => {
      item['$$id'] = this._itemId++;
      // if (!item.children) { item.children = []; }
    });
  }

  /**
   * @deprecated
   */
  private _destroy(el?) {
    if (typeof el === 'undefined') {
      for (const i of this.items) { i.destroy(); }
    } else {
      const target = this.items.find(i => i.el === el);
      if (target) { target.destroy(); }
    }
  }

  private _createDragClone(event, dragItem) {
    this._mouseStart(event, dragItem);

    // create drag clone
    this.dragEl = document.createElement(this.options.listNodeName);
    document.body.appendChild(this.dragEl);

    this.renderer.addClass(this.dragEl, this.options.dragClass);
    // this.renderer.addClass(this.dragEl, this.options.listClass);

    // add drag clone to body and set css
    this.renderer.setStyle(this.dragEl, 'left', event.pageX - this._mouse.offsetX + PX);
    this.renderer.setStyle(this.dragEl, 'top', event.pageY - this._mouse.offsetY + PX);
    this.renderer.setStyle(this.dragEl, 'position', 'absolute');
    this.renderer.setStyle(this.dragEl, 'z-index', 9999);
    this.renderer.setStyle(this.dragEl, 'pointer-events', 'none');


  }

  private _createPlaceholder(event, dragItem) {
    this._placeholder = document.createElement('div');
    this._placeholder.classList.add(this.options.placeClass);
    helper._insertAfter(this._placeholder, dragItem);
    dragItem.parentNode.removeChild(dragItem);
    this.dragEl.appendChild(dragItem);
    this.dragRootEl = dragItem;
  }

  /**
   * Sets depth proerties (relative and drag)
   */
  private _calculateDepth() {
    // total depth of dragging item
    let depth;
    const items = this.dragEl.querySelectorAll(this.options.itemNodeName);
    for (let i = 0; i < items.length; i++) {
      depth = helper._getParents(items[i], this.dragEl).length;
      if (depth > this.dragDepth) { this.dragDepth = depth; }
    }

    // depth relative to root
    this.relativeDepth = helper._getParents(this._placeholder, this.el.nativeElement).length;
  }

  private _mouseStart(event, dragItem) {
    this._mouse.offsetX = event.pageX - helper._offset(dragItem).left;
    this._mouse.offsetY = event.pageY - helper._offset(dragItem).top;
    this._mouse.startX = this._mouse.lastX = event.pageX;
    this._mouse.startY = this._mouse.lastY = event.pageY;
  }

  private _mouseUpdate(event) {
    // mouse position last events
    this._mouse.lastX = this._mouse.nowX;
    this._mouse.lastY = this._mouse.nowY;
    // mouse position this events
    this._mouse.nowX = event.pageX;
    this._mouse.nowY = event.pageY;
    // distance mouse moved between events
    this._mouse.distX = this._mouse.nowX - this._mouse.lastX;
    this._mouse.distY = this._mouse.nowY - this._mouse.lastY;
    // direction mouse was moving
    this._mouse.lastDirX = this._mouse.dirX;
    this._mouse.lastDirY = this._mouse.dirY;
    // direction mouse is now moving (on both axis)
    this._mouse.dirX = this._mouse.distX === 0 ? 0 : this._mouse.distX > 0 ? 1 : -1;
    this._mouse.dirY = this._mouse.distY === 0 ? 0 : this._mouse.distY > 0 ? 1 : -1;
  }

  /**
   * calc mouse traverse distance on axis
   * @param m - mouse
   */
  private _calcMouseDistance(m) {
    m.distAxX += Math.abs(m.distX);
    if (m.dirX !== 0 && m.dirX !== m.lastDirX) { m.distAxX = 0; }

    m.distAxY += Math.abs(m.distY);
    if (m.dirY !== 0 && m.dirY !== m.lastDirY) { m.distAxY = 0; }
  }

  private _move(event) {
    let depth, list, isEmpty = false;

    this.renderer.setStyle(this.dragEl, 'left', event.pageX - this._mouse.offsetX + PX);
    this.renderer.setStyle(this.dragEl, 'top', event.pageY - this._mouse.offsetY + PX);

    this._mouseUpdate(event);

    // axis mouse is now moving on
    const newAx = Math.abs(this._mouse.distX) > Math.abs(this._mouse.distY) ? 1 : 0;

    // do nothing on first move
    if (!this._mouse.moving) {
      this._mouse.dirAx = newAx;
      this._mouse.moving = 1;
      return;
    }

    // calc distance moved on this axis (and direction)
    if (this._mouse.dirAx !== newAx) {
      this._mouse.distAxX = 0;
      this._mouse.distAxY = 0;
    } else {
      this._calcMouseDistance(this._mouse);
    }
    this._mouse.dirAx = newAx;

    // find list item under cursor
    if (!hasPointerEvents) { this.dragEl.style.visibility = 'hidden'; }

    this.pointEl = document.elementFromPoint(
      event.pageX - document.body.scrollLeft,
      event.pageY - (window.pageYOffset || document.documentElement.scrollTop)
    );

    if (!hasPointerEvents) { this.dragEl.style.visibility = 'visible'; }
console.log(this.pointEl)
    if (this.pointEl && this.pointEl.classList.contains('nestable-item-container')) {
      this.pointEl = helper._closest(this.pointEl, this.options.itemNodeName + '.' + this.options.itemClass);
    } else {
      return;
    }

    // get point element depth
    let pointDepth;
    pointDepth = helper._getParents(this.pointEl,
      this.el.nativeElement.querySelector(this.options.listNodeName + '.' + this.options.listClass)
    ).length;

    /**
     * move horizontal
     */
    if (!this.options.fixedDepth
      && this._mouse.dirAx
      && this._mouse.distAxX >= this.options.threshold
    ) {
      // reset move distance on x-axis for new phase
      this._mouse.distAxX = 0;
      const previous = this._placeholder.previousElementSibling;
      // increase horizontal level if previous sibling exists, is not collapsed, and can have children
      if (this._mouse.distX > 0 && previous
        && !previous.classList.contains(this.options.collapsedClass) // cannot increase level when item above is collapsed
        // && !previous.classList.contains(this.options.noChildrenClass)
      ) {

        list = previous.querySelectorAll(this.options.listNodeName + '.' + this.options.listClass);
        list = list[list.length - 1];

        // check if depth limit has reached
        depth = helper._getParents(this._placeholder,
          this.el.nativeElement.querySelector(this.options.listNodeName + '.' + this.options.listClass)
        ).length;
        if (depth + this.dragDepth <= this.options.maxDepth) {
          // create new sub-level if one doesn't exist
          if (!list) {
            list = document.createElement(this.options.listNodeName);
            list.classList.add(this.options.listClass);
            list.appendChild(this._placeholder);
            previous.appendChild(list);
            this.setParent(previous);
          } else {
            // else append to next level up
            list = previous.querySelector(`:scope > ${this.options.listNodeName}.${this.options.listClass}`);
            list.appendChild(this._placeholder);
          }
        }
      }
      // decrease horizontal level
      if (this._mouse.distX < 0) {
        // we can't decrease a level if an item preceeds the current one
        const next = document.querySelector(`.${this.options.placeClass} + ${this.options.itemNodeName}.${this.options.itemClass}`);
        const parentElement = this._placeholder.parentElement;
        if (!next && parentElement) {
          const closestItem = helper._closest(this._placeholder, this.options.itemNodeName + '.' + this.options.itemClass);

          if (closestItem) {
            parentElement.removeChild(this._placeholder);
            helper._insertAfter(this._placeholder, closestItem);
          }

          if (!parentElement.children.length) {
            this.unsetParent(parentElement.parentElement);
          }
        }
      }
    }

    if (this.pointEl && this.pointEl.classList.contains(this.options.emptyClass)) {
      isEmpty = true;
    } else if (!this.pointEl || !this.pointEl.classList.contains(this.options.itemClass)) {
      return;
    }

    // find root list of item under cursor
    const pointElRoot = helper._closest(this.pointEl, `.${this.options.rootClass}`),
      isNewRoot = pointElRoot ? this.dragRootEl.dataset['nestable-id'] !== pointElRoot.dataset['nestable-id'] : false;

    /**
     * move vertical
     */
    if (!this._mouse.dirAx || isNewRoot || isEmpty) {
      // check if groups match if dragging over new root
      if (isNewRoot && this.options.group !== pointElRoot.dataset['nestable-group']) {
        return;
      }

      // check depth limit
      depth = this.dragDepth - 1 + helper._getParents(this.pointEl,
        this.el.nativeElement.querySelector(this.options.listNodeName + '.' + this.options.listClass)
      ).length;

      if (depth > this.options.maxDepth) { return; }

      const before = event.pageY < (helper._offset(this.pointEl).top + this.pointEl.clientHeight / 2);
      const placeholderParent = this._placeholder.parentNode;

      if (this.options.fixedDepth) {
        if (pointDepth === this.relativeDepth - 1) {
          const children = this.pointEl.querySelector(this.options.listNodeName + '.' + this.options.listClass);
          if (!children) {
            const newList = document.createElement(this.options.listNodeName);
            newList.classList.add(this.options.listClass);
            newList.appendChild(this._placeholder);
            this.pointEl.appendChild(newList);
          }
        } else if (pointDepth === this.relativeDepth) {
          if (before) {
            this.pointEl.parentElement.insertBefore(this._placeholder, this.pointEl);
          } else {
            helper._insertAfter(this._placeholder, this.pointEl);
          }
        } else { return; }
      } else if (before) {
        this.pointEl.parentElement.insertBefore(this._placeholder, this.pointEl);
      } else {
        helper._insertAfter(this._placeholder, this.pointEl);
      }

      if (!placeholderParent.children.length) {
        this.unsetParent(placeholderParent.parentElement);
      }
    }
  }

  /**
   * @deprecated
   * @param draggedEl
   */
  public updateModelFromDOM(draggedEl) {
    const tempArray = [...this._list];

    // empty model array
    this._list.length = 0;

    const list = this.el.nativeElement
      .querySelector(`${this.options.listNodeName}.${this.options.listClass}`)
      .children;

    helper._traverseChildren(list, item => {
      if (item.nodeName === 'LI') {
        if (!item.parentElement.parentElement.id) {
          const child = Object.assign({}, helper._findObjectInTree(tempArray, item.id));
          delete child.children;
          this._list.push(child);

          if (!item.querySelector(`:scope > ${this.options.listNodeName}.${this.options.listClass}`)) {
            delete child.expanded;
          }

        } else {
          const parent = helper._findObjectInTree(this._list, item.parentElement.parentElement.id);
          if (!parent.children) { parent.children = []; }

          const child = Object.assign({}, helper._findObjectInTree(tempArray, item.id));
          delete child.children;

          parent.children.push(child);

          if (!item.querySelector(`:scope > ${this.options.listNodeName}.${this.options.listClass}`)) {
            delete child.expanded;
          }
        }
      }
    });
  }

  public reset() {
    const keys = Object.keys(this._mouse);
    for (const key of keys) {
      this._mouse[key] = 0;
    }

    this._itemId = 0;
    this.moving = false;
    this.dragEl = null;
    this.dragRootEl = null;
    this.dragDepth = 0;
    this.relativeDepth = 0;
    this.hasNewRoot = false;
    this.pointEl = null;

    // this._destroy(); // TODO remove

    // this._createDragListeners(); // TODO remove
    // this._createColapseListeners(); // TODO remove
  }

  public dragStart(event, item, parentList) {
    event.stopPropagation();
    event.preventDefault();

    if (event.originalEvent) { event = event.originalEvent; }

    // allow only first mouse button
    if (event.type.indexOf('mouse') === 0) {
      if (event.button !== 0) { return; }
    } else {
      if (event.touches.length !== 1) { return; }
    }

    this.ref.detach();
    parentList.splice(parentList.indexOf(item), 1);

    this.zone.runOutsideAngular(() => {
      const dragItem = helper._closest(
        event.target,
        this.options.itemNodeName + '.' + this.options.itemClass
      );

      if (dragItem === null) { return; }

      const dragRect = dragItem.getBoundingClientRect();

      this._createDragClone(event, dragItem);
      this.renderer.setStyle(this.dragEl, 'width', dragRect.width + PX);

      this._createPlaceholder(event, dragItem);
      this.renderer.setStyle(this._placeholder, 'height', dragRect.height + PX);

      this._calculateDepth();

      this._cancelMouseup = this.renderer.listen(document, 'mouseup', this.dragStop.bind(this));
      this._cancelMousemove = this.renderer.listen(document, 'mousemove', this.dragMove.bind(this));
    });
  }

  public dragStop(event) {
    this._cancelMouseup();
    this._cancelMousemove();
    this.ref.reattach();
    // debugger

    if (!this.dragEl) { return; }

    // const draggedId = Number.parseInt(this.dragEl.firstElementChild.id);
    this.dragEl.parentNode.removeChild(this.dragEl);
    this.dragEl.remove();
    this.reset();
    this.ref.markForCheck();

    // helper._replaceTargetWithElements(this._placeholder, this.dragEl.children);
    // this.updateModelFromDOM(document.getElementById(draggedId.toString()));

    // let draggedItem, parentItem;
    // helper._traverseChildren(this.list, (item, parent) => {
    //   if (item['$$id'] === draggedId) {
    //     draggedItem = item, parentItem = parent;
    //     return true;
    //   }
    // });

    // this.el.nativeElement
    //   .dispatchEvent(new CustomEvent('listUpdated', {
    //     detail: {
    //       list: this.list,
    //       draggedItem,
    //       parentItem
    //     },
    //     bubbles: true
    //   }));

  }

  public dragMove(event) {
    if (this.dragEl) {
      event.preventDefault();

      if (event.originalEvent) { event = event.originalEvent; }
      this._move(event.type.indexOf('mouse') === 0 ? event : event.touches[0]);
    }
  }

  ///////////////////// COLLAPSE / EXPAND

  /**
   * @deprecated
   * @param li
   * @param expanded
   */
  private _exportCollapsed(li, expanded: boolean) {
    const item = helper._findObjectInTree(this._list, li.id);
    if (expanded) {
      delete item.expanded;
    } else {
      item.expanded = false;
    }

    this.el.nativeElement
      .dispatchEvent(new CustomEvent('listUpdated', {
        detail: {
          list: this.list
        },
        bubbles: true
      }));
  }

  public expandAll() {
    const items = document.querySelectorAll(`${this.options.itemNodeName}.${this.options.itemClass}`);
    for (let i = 0; i < items.length; i++) {
      this.expandItem(items[i]);
    }
  }

  public collapseAll() {
    const items = document.querySelectorAll(`${this.options.itemNodeName}.${this.options.itemClass}`);
    for (let i = 0; i < items.length; i++) {
      this.collapseItem(items[i]);
    }
  }

  /**
   * deprecated
   * @param li
   */
  public setParent(li) {
    if (li.querySelectorAll(`:scope > ${this.options.listNodeName}.${this.options.listClass}`).length
      && !li.querySelectorAll(`:scope > button`).length
    ) {
      li.insertAdjacentHTML('afterbegin', this.options.expandBtnHTML);
      li.insertAdjacentHTML('afterbegin', this.options.collapseBtnHTML);
    }
  }

  /**
   * @deprecated
   * @param li
   */
  public unsetParent(li) {
    const childButtons = li.querySelectorAll(`:scope > [data-action]`);
    for (let i = 0; i < childButtons.length; i++) {
      childButtons[i].parentElement.removeChild(childButtons[i]);
      childButtons[i].remove();
    }
    const list = li.querySelector(`${this.options.listNodeName}.${this.options.listClass}`);
    list.parentElement.removeChild(list);
    li.classList.remove(this.options.collapsedClass);
  }

  public expandItem(li) {
    li.classList.remove(this.options.collapsedClass);

    const childButtons = li.querySelectorAll(`:scope > [data-action]`);
    for (let i = 0; i < childButtons.length; i++) {
      const action = childButtons[i].dataset['action'];
      if (action === 'collapse') {
        childButtons[i].style.display = 'block';
      }
      if (action === 'expand') {
        childButtons[i].style.display = 'none';
      }
    }

    if (this.options.exportCollapsed) { this._exportCollapsed(li, true); }
  }

  public collapseItem(li) {
    const lists = li.querySelectorAll(`:scope > ${this.options.listNodeName}.${this.options.listClass}`);
    if (lists.length) {
      li.classList.add(this.options.collapsedClass);
    }
    const childButtons = li.querySelectorAll(`:scope > [data-action]`);
    for (let i = 0; i < childButtons.length; i++) {
      const action = childButtons[i].dataset['action'];
      if (action === 'collapse') {
        childButtons[i].style.display = 'none';
      }
      if (action === 'expand') {
        childButtons[i].style.display = 'block';
      }
    }

    if (this.options.exportCollapsed) { this._exportCollapsed(li, false); }
  }

}
