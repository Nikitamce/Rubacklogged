'use strict';

/*
 * A deliberately small DOM stub: enough to boot content.js and verify the
 * translation/protection/restore flow without a browser or jsdom.
 */

class Node {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node.nodeType === 9) return true;
      node = node.parentNode;
    }
    return false;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
}

Node.ELEMENT_NODE = 1;
Node.TEXT_NODE = 3;

class Text extends Node {
  constructor(value) {
    super(3);
    this._value = String(value);
  }

  get nodeValue() {
    return this._value;
  }

  set nodeValue(value) {
    this._value = String(value);
  }

  get textContent() {
    return this._value;
  }

  set textContent(value) {
    this._value = String(value);
  }
}

function parseCompound(selector) {
  const tokens = [];
  const re = /([.#]?[\w-]+|\[[^\]]+\])/g;
  let match;
  while ((match = re.exec(selector))) tokens.push(match[1]);
  return tokens;
}

function matchesCompound(element, selector) {
  for (const token of parseCompound(selector)) {
    if (token.startsWith('.')) {
      if (!element.classList.contains(token.slice(1))) return false;
    } else if (token.startsWith('#')) {
      if (element.id !== token.slice(1)) return false;
    } else if (token.startsWith('[')) {
      const body = token.slice(1, -1);
      const eq = body.match(/^([\w-]+)(?:([\^$*]?=)"?([^"]*)"?)?$/);
      if (!eq) return false;
      const name = eq[1];
      const operator = eq[2];
      const expected = eq[3];
      const actual = element.getAttribute(name);
      if (actual === null) return false;
      if (operator === '^=') {
        if (!actual.startsWith(expected)) return false;
      } else if (operator === '=') {
        if (actual !== expected) return false;
      }
    } else if (element.tagName !== token.toUpperCase()) {
      return false;
    }
  }
  return true;
}

function matchesComplex(element, selector) {
  const parts = selector.trim().split(/\s+/);
  if (!matchesCompound(element, parts[parts.length - 1])) return false;
  let index = parts.length - 2;
  let node = element.parentNode;
  while (index >= 0 && node) {
    if (node.nodeType === 1 && matchesCompound(node, parts[index])) index -= 1;
    node = node.parentNode;
  }
  return index < 0;
}

class ClassList {
  constructor(element) {
    this.element = element;
    this.set = new Set();
  }

  add(...names) {
    for (const name of names) if (name) this.set.add(name);
  }

  remove(...names) {
    for (const name of names) this.set.delete(name);
  }

  contains(name) {
    return this.set.has(name);
  }

  toggle(name, force) {
    const enable = force === undefined ? !this.set.has(name) : !!force;
    if (enable) this.set.add(name);
    else this.set.delete(name);
    return enable;
  }

  toString() {
    return [...this.set].join(' ');
  }
}

class Element extends Node {
  constructor(tagName) {
    super(1);
    this.tagName = tagName === 'svg' ? 'svg' : String(tagName).toUpperCase();
    this.attributes = new Map();
    this.classList = new ClassList(this);
    this.id = '';
    this.isContentEditable = false;
    this.listeners = new Map();
    this._title = '';
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get title() {
    return this._title;
  }

  set title(value) {
    this._title = String(value);
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    for (const child of this.childNodes.slice()) this.removeChild(child);
    if (value !== '') this.appendChild(new Text(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
  }

  matches(selector) {
    return selector.split(',').some((part) => matchesComplex(this, part));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.nodeType === 1 && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((part) => part.trim());
    const result = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        if (selectors.some((part) => matchesComplex(child, part))) result.push(child);
        walk(child);
      }
    };
    walk(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class Document extends Node {
  constructor() {
    super(9);
    this.readyState = 'complete';
    this._title = '';
    this.documentElement = new Element('html');
    this.documentElement.parentNode = this;
    this._body = new Element('body');
    this.documentElement.appendChild(this._body);
    this.listeners = new Map();
    this.observerCallback = null;
  }

  get body() {
    return this._body;
  }

  createElement(tagName) {
    return new Element(tagName);
  }

  createTextNode(value) {
    return new Text(value);
  }

  getElementById(id) {
    return this.querySelector('#' + id);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  createTreeWalker(root, whatToShow, filter) {
    const textNodes = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) textNodes.push(child);
        else walk(child);
      }
    };
    walk(root);
    let index = 0;
    return {
      nextNode() {
        while (index < textNodes.length) {
          const node = textNodes[index++];
          if (!filter || !filter.acceptNode) return node;
          if (filter.acceptNode(node) === 1) return node;
        }
        return null;
      },
    };
  }

  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
  }

  get title() {
    return this._title;
  }

  set title(value) {
    this._title = String(value);
  }

  get lang() {
    return this.documentElement.getAttribute('lang');
  }
}

class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = false;
    this.doc = null;
  }

  observe(target) {
    this.observed = true;
    this.target = target;
  }

  disconnect() {
    this.observed = false;
  }
}

function createEnvironment() {
  const document = new Document();
  const handlers = {};
  const messageListeners = [];
  const storageListeners = [];
  let observer = null;

  const chrome = {
    storage: {
      sync: {
        get(defaults, callback) {
          callback(Object.assign({}, defaults));
        },
        set() {},
      },
      onChanged: {
        addListener(handler) {
          storageListeners.push(handler);
        },
      },
    },
    runtime: {
      lastError: null,
      onMessage: {
        addListener(handler) {
          messageListeners.push(handler);
        },
      },
      getManifest() {
        return { version: '2.0.0' };
      },
    },
  };

  const windowObject = {
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    setTimeout,
    clearTimeout,
  };

  const sandbox = {
    window: windowObject,
    document,
    Node,
    NodeFilter: {
      SHOW_TEXT: 4,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
    },
    MutationObserver: class extends MutationObserver {
      constructor(callback) {
        super(callback);
        observer = this;
      }
    },
    navigator: {
      language: 'ru-RU',
      languages: ['ru-RU', 'ru', 'en'],
    },
    chrome,
    console,
    setTimeout,
    clearTimeout,
    Intl,
  };

  return {
    document,
    windowObject,
    sandbox,
    handlers,
    messageListeners,
    storageListeners,
    getObserver: () => observer,
  };
}

function append(parent, ...children) {
  for (const child of children) parent.appendChild(child);
  return parent;
}

function text(value) {
  return new Text(value);
}

function element(tagName, options, ...children) {
  const node = new Element(tagName);
  if (options) {
    if (options.id) node.id = options.id;
    if (options.className) node.className = options.className;
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) node.setAttribute(name, value);
    }
  }
  append(node, ...children);
  return node;
}

module.exports = {
  Document,
  Element,
  Node,
  Text,
  MutationObserver,
  createEnvironment,
  element,
  text,
};
