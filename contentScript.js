(() => {
  "use strict";

  // ============================================================
  // F12 TECH v2.0 - ENHANCED EDITION
  // ============================================================

  // ---------- Constants ----------
  const EXT_NS = "f12tech";
  const ROOT_ID = "__f12tech_root__";
  const STYLE_ID = "__f12tech_style__";
  const OVERLAY_ID = "__f12tech_overlay__";
  const PATCH_STORE_PREFIX = "f12tech::patches::";

  // ---------- Utilities ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);

  function throttle(fn, limit) {
    let waiting = false;
    let lastArgs = null;
    return function (...args) {
      if (!waiting) {
        fn.apply(this, args);
        waiting = true;
        setTimeout(() => {
          waiting = false;
          if (lastArgs) {
            fn.apply(this, lastArgs);
            lastArgs = null;
          }
        }, limit);
      } else {
        lastArgs = args;
      }
    };
  }

  function debounce(fn, delay) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  // ---------- DOM Helpers ----------
  function isEditableTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === ROOT_ID || el.id === OVERLAY_ID) return false;
    if (el.closest && el.closest(`#${ROOT_ID}, #${OVERLAY_ID}`)) return false;
    // Skip script, style, meta, etc.
    const skipTags = ["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD", "HTML"];
    if (skipTags.includes(el.tagName)) return false;
    return true;
  }

  function getUrlParts() {
    const u = new URL(location.href);
    return {
      origin: u.origin,
      pathname: u.pathname,
      search: u.search,
      hash: u.hash,
    };
  }

  function makeScopeKey(scope) {
    const { origin, pathname, search } = getUrlParts();
    if (scope === "origin") return origin;
    if (scope === "path") return origin + pathname;
    return origin + pathname + search;
  }

  function safeQueryAll(selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function safeQueryOne(selector) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  // ============================================================
  // SHADOW DOM HELPERS
  // ============================================================

  /**
   * Get the deepest element at a point, piercing through Shadow DOM (including closed)
   */
  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    if (!el) return null;

    // Keep drilling into shadow roots (open ones)
    let lastEl = el;
    let depth = 0;
    const maxDepth = 20;

    while (el && depth < maxDepth) {
      lastEl = el;
      
      // Check if element has open shadow root
      if (el.shadowRoot) {
        const shadowEl = el.shadowRoot.elementFromPoint(x, y);
        if (shadowEl && shadowEl !== el) {
          el = shadowEl;
          depth++;
          continue;
        }
      }
      
      break;
    }

    return lastEl;
  }

  /**
   * Get deepest element from event's composedPath (works with closed Shadow DOM)
   */
  function getDeepestFromEvent(event) {
    if (!event || typeof event.composedPath !== 'function') return null;
    
    const path = event.composedPath();
    if (!path || path.length === 0) return null;
    
    // composedPath returns elements from deepest (target) to window
    // The first element is the actual target, even inside closed Shadow DOM
    for (let i = 0; i < path.length; i++) {
      const el = path[i];
      
      // Skip non-element nodes (text nodes, document, window)
      if (!el || el.nodeType !== 1) continue;
      
      // Skip our extension's elements
      if (el.id === ROOT_ID || el.id === OVERLAY_ID) continue;
      if (el.closest && el.closest(`#${ROOT_ID}, #${OVERLAY_ID}`)) continue;
      
      // Skip unwanted tags
      const skipTags = ["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD", "HTML", "BODY"];
      if (skipTags.includes(el.tagName)) continue;
      
      // Found a valid element
      return el;
    }
    
    return null;
  }

  /**
   * Get all shadow roots in the document (for querying)
   */
  function getAllShadowRoots(root = document) {
    const shadowRoots = [];
    const visited = new WeakSet();
    
    function traverse(node) {
      if (!node || visited.has(node)) return;
      visited.add(node);
      
      // Check for shadow root
      if (node.shadowRoot && !visited.has(node.shadowRoot)) {
        shadowRoots.push(node.shadowRoot);
        visited.add(node.shadowRoot);
        traverse(node.shadowRoot);
      }
      
      // Traverse all children
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
      
      // Also check direct childNodes for shadow hosts
      if (node.childNodes) {
        for (const child of node.childNodes) {
          if (child.nodeType === 1) { // Element node
            traverse(child);
          }
        }
      }
    }
    
    // Start from document body and html
    if (root === document) {
      traverse(document.documentElement);
      traverse(document.body);
    } else {
      traverse(root);
    }
    
    return shadowRoots;
  }

  /**
   * Query selector that pierces Shadow DOM
   */
  function querySelectorDeep(selector, root = document) {
    // Try normal query first
    let result = null;
    try {
      result = root.querySelector(selector);
    } catch {}
    
    if (result) return result;
    
    // Search in shadow roots
    const shadowRoots = getAllShadowRoots(root);
    for (const shadowRoot of shadowRoots) {
      try {
        result = shadowRoot.querySelector(selector);
        if (result) return result;
      } catch {}
    }
    
    return null;
  }

  /**
   * Query all matching elements including in Shadow DOM
   */
  function querySelectorAllDeep(selector, root = document) {
    const results = [];
    
    // Query in main document
    try {
      results.push(...root.querySelectorAll(selector));
    } catch {}
    
    // Query in shadow roots
    const shadowRoots = getAllShadowRoots(root);
    for (const shadowRoot of shadowRoots) {
      try {
        results.push(...shadowRoot.querySelectorAll(selector));
      } catch {}
    }
    
    return results;
  }

  /**
   * Get the path from document to element, including shadow boundaries
   */
  function getElementPath(el) {
    const path = [];
    let current = el;
    
    while (current) {
      path.unshift({
        element: current,
        inShadow: current.getRootNode() instanceof ShadowRoot
      });
      
      const root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        current = root.host;
      } else {
        current = current.parentElement;
      }
    }
    
    return path;
  }

  /**
   * Check if element is inside a Shadow DOM
   */
  function isInShadowDOM(el) {
    return el.getRootNode() instanceof ShadowRoot;
  }

  /**
   * Get the shadow host if element is in shadow DOM
   */
  function getShadowHost(el) {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) {
      return root.host;
    }
    return null;
  }

  // ============================================================
  // ENHANCED SELECTOR ENGINE v2
  // ============================================================

  class SelectorEngine {
    constructor() {
      this.maxDepth = 8;
      this.cache = new WeakMap();
    }

    // Check if selector is unique
    isUnique(selector) {
      const els = safeQueryAll(selector);
      return els.length === 1;
    }

    // Get element index among siblings of same tag
    getNthOfType(el) {
    const parent = el.parentElement;
    if (!parent) return 1;
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      return siblings.indexOf(el) + 1;
    }

    // Get element index among all siblings
    getNthChild(el) {
      const parent = el.parentElement;
      if (!parent) return 1;
      return Array.from(parent.children).indexOf(el) + 1;
    }

    // Escape CSS identifier
    escapeCSS(str) {
      return CSS.escape(str);
    }

    // Build ID selector
    buildIdSelector(el) {
      if (!el.id) return null;
      const sel = `#${this.escapeCSS(el.id)}`;
      if (this.isUnique(sel)) return sel;
      return null;
    }

    // Build class-based selector
    buildClassSelector(el) {
      if (!el.classList || el.classList.length === 0) return null;
      const classes = Array.from(el.classList)
        .filter((c) => c && c.length <= 50 && !/^[0-9]/.test(c))
        .slice(0, 3);
      if (classes.length === 0) return null;

      const classStr = classes.map((c) => `.${this.escapeCSS(c)}`).join("");
      const sel = `${el.tagName.toLowerCase()}${classStr}`;
      if (this.isUnique(sel)) return sel;
      return null;
    }

    // Build data-attribute selector
    buildDataAttrSelector(el) {
      const dataAttrs = Array.from(el.attributes).filter(
        (a) =>
          a.name.startsWith("data-") &&
          !a.name.includes("f12tech") &&
          a.value.length <= 100 &&
          a.value.length > 0
      );

      for (const attr of dataAttrs) {
        const sel = `${el.tagName.toLowerCase()}[${attr.name}="${this.escapeCSS(attr.value)}"]`;
        if (this.isUnique(sel)) return sel;
      }
      return null;
    }

    // Build aria/role selector
    buildAriaSelector(el) {
      const ariaAttrs = ["aria-label", "aria-labelledby", "role", "name", "title", "alt"];
      for (const attrName of ariaAttrs) {
        const val = el.getAttribute(attrName);
        if (val && val.length <= 80) {
          const sel = `${el.tagName.toLowerCase()}[${attrName}="${this.escapeCSS(val)}"]`;
          if (this.isUnique(sel)) return sel;
        }
      }
      return null;
    }

    // Build href/src selector for links and images
    buildLinkSelector(el) {
      if (el.tagName === "A" && el.href) {
        // Use pathname to be more stable
        try {
          const url = new URL(el.href);
          const sel = `a[href*="${this.escapeCSS(url.pathname.slice(0, 50))}"]`;
          if (this.isUnique(sel)) return sel;
        } catch {}
      }
      if (el.tagName === "IMG" && el.src) {
        try {
          const url = new URL(el.src);
          const filename = url.pathname.split("/").pop();
          if (filename) {
            const sel = `img[src*="${this.escapeCSS(filename)}"]`;
            if (this.isUnique(sel)) return sel;
          }
        } catch {}
      }
      return null;
    }

    // Build text-content based selector (for buttons, links, etc.)
    buildTextSelector(el) {
      const textTags = ["BUTTON", "A", "SPAN", "LABEL", "H1", "H2", "H3", "H4", "H5", "H6"];
      if (!textTags.includes(el.tagName)) return null;

      const text = (el.textContent || "").trim();
      if (text.length === 0 || text.length > 50) return null;

      // Use :has to avoid child content issues
      // Fallback to contains-like matching
      const tag = el.tagName.toLowerCase();

      // Check direct text content
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        // This is more reliable for leaf text nodes
        const parentSel = this.buildPathSelector(el.parentElement, 3);
        if (parentSel) {
          const combined = `${parentSel} > ${tag}`;
          const matches = safeQueryAll(combined);
          const idx = matches.indexOf(el);
          if (idx !== -1 && matches.length <= 5) {
            const finalSel = `${combined}:nth-child(${this.getNthChild(el)})`;
            if (this.isUnique(finalSel)) return finalSel;
          }
        }
      }
      return null;
    }

    // Build path selector (main strategy) - MUST be unique
    buildPathSelector(el, maxDepth = this.maxDepth) {
    const parts = [];
    let cur = el;
    let depth = 0;

      while (cur && cur.nodeType === 1 && depth < maxDepth) {
      let part = cur.tagName.toLowerCase();

        // Add ID if exists - but always add nth-of-type to ensure uniqueness
        if (cur.id) {
          part = `#${this.escapeCSS(cur.id)}`;
        } else {
          // Add classes (limited)
          const classes = Array.from(cur.classList || [])
            .filter((c) => c && c.length <= 40 && !/^[0-9]/.test(c) && !c.includes('style-scope'))
            .slice(0, 2);

          if (classes.length) {
            part += classes.map((c) => `.${this.escapeCSS(c)}`).join("");
          }
        }

        // ALWAYS add nth-of-type for uniqueness (even with ID)
        const nth = this.getNthOfType(cur);
      part += `:nth-of-type(${nth})`;

      parts.unshift(part);

      const candidate = parts.join(" > ");
        if (this.isUnique(candidate)) return candidate;

      cur = cur.parentElement;
      depth++;
    }

    return parts.join(" > ");
  }

    // Build XPath as fallback
    buildXPath(el) {
      const parts = [];
      let cur = el;
      let hasIdPrefix = false;

      while (cur && cur.nodeType === 1) {
        let part = cur.tagName.toLowerCase();

        if (cur.id) {
          // ID found - use it as the starting point
          parts.unshift(`*[@id="${cur.id}"]`);
          hasIdPrefix = true;
          break;
        }

        const parent = cur.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(cur) + 1;
            part += `[${idx}]`;
          }
        }

        parts.unshift(part);
        cur = cur.parentElement;
      }

      return "//" + parts.join("/");
    }

    // Build path through Shadow DOM boundaries
    buildShadowPath(el) {
      const pathParts = [];
      let current = el;

      // Traverse up through shadow boundaries
      while (current) {
        const root = current.getRootNode();
        
        if (root instanceof ShadowRoot) {
          // We're in a shadow root, get the host element
          const host = root.host;
          
          // Build selector for the host
          let hostSelector = host.tagName.toLowerCase();
          
          if (host.id) {
            hostSelector = `#${this.escapeCSS(host.id)}`;
          } else {
            // Use classes or nth-of-type
            const classes = Array.from(host.classList || [])
              .filter(c => c && c.length <= 40)
              .slice(0, 2);
            if (classes.length) {
              hostSelector += classes.map(c => `.${this.escapeCSS(c)}`).join("");
            }
            // Add nth-of-type for stability
            const nth = this.getNthOfType(host);
            hostSelector += `:nth-of-type(${nth})`;
          }
          
          pathParts.unshift(hostSelector);
          current = host;
        } else {
          // We're in the main document
          break;
        }
      }

      return pathParts.join(" >>> "); // Use >>> as shadow boundary delimiter
    }

    // Evaluate XPath
    evaluateXPath(xpath) {
      try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      } catch {
        return null;
      }
    }

    // Main method: get best selector for element
    getSelector(el) {
      if (!el || el.nodeType !== 1) return null;

      // Check cache
      if (this.cache.has(el)) {
        return this.cache.get(el);
      }

      // Check if element is in Shadow DOM
      const inShadow = isInShadowDOM(el);
      const root = el.getRootNode();
      
      // Helper to check uniqueness within the correct root
      const isUniqueInRoot = (sel) => {
        try {
          const els = root.querySelectorAll(sel);
          return els.length === 1;
        } catch {
          return false;
        }
      };
      
      // Helper to check if selector is UNIQUE with deep search (must match exactly 1 element)
      const isUniqueDeep = (sel) => {
        try {
          const els = querySelectorAllDeep(sel);
          // MUST be exactly 1 element and it must be our element
          return els.length === 1 && els[0] === el;
        } catch {
          return false;
        }
      };

      // Try strategies in order of preference
      const strategies = [
        () => this.buildIdSelector(el),
        () => this.buildDataAttrSelector(el),
        () => this.buildAriaSelector(el),
        () => this.buildLinkSelector(el),
        () => this.buildClassSelector(el),
        () => this.buildTextSelector(el),
        () => this.buildPathSelector(el),
      ];

      for (const strategy of strategies) {
        const sel = strategy();
        if (!sel) continue;
        
        if (inShadow) {
          // For Shadow DOM: prefer simple CSS selector that works with deep search
          if (isUniqueDeep(sel)) {
            // Simple CSS selector works globally - use it directly
            const result = { type: "css", value: sel };
            this.cache.set(el, result);
            return result;
          }
          // Fallback to shadow path
          if (isUniqueInRoot(sel)) {
            const shadowPath = this.buildShadowPath(el);
            const result = { type: "shadow", hostSelector: shadowPath, innerSelector: sel };
            this.cache.set(el, result);
            return result;
          }
        } else {
          if (this.isUnique(sel)) {
            this.cache.set(el, { type: "css", value: sel });
            return { type: "css", value: sel };
          }
        }
      }

      // Fallback: path selector
      const pathSel = this.buildPathSelector(el);
      if (pathSel) {
        if (inShadow) {
          // Try deep search first
          if (isUniqueDeep(pathSel)) {
            const result = { type: "css", value: pathSel };
            this.cache.set(el, result);
            return result;
          }
          const shadowPath = this.buildShadowPath(el);
          const result = { type: "shadow", hostSelector: shadowPath, innerSelector: pathSel };
          this.cache.set(el, result);
          return result;
        }
        const found = safeQueryOne(pathSel);
        if (found === el) {
          this.cache.set(el, { type: "css", value: pathSel });
          return { type: "css", value: pathSel };
        }
      }

      // Ultimate fallback: use ID-based CSS if element has ID (works with deep search)
      if (el.id) {
        const idSel = `#${this.escapeCSS(el.id)}`;
        const result = { type: "css", value: idSel };
        this.cache.set(el, result);
        return result;
      }

      // XPath as last resort
      const xpath = this.buildXPath(el);
      this.cache.set(el, { type: "xpath", value: xpath });
      return { type: "xpath", value: xpath };
    }

    // Find element by selector (supports both CSS and XPath)
    findElement(selectorObj) {
      if (!selectorObj) return null;

      if (typeof selectorObj === "string") {
        // Legacy: assume CSS - also try deep search
        return safeQueryOne(selectorObj) || querySelectorDeep(selectorObj);
      }

      if (selectorObj.type === "css") {
        return safeQueryOne(selectorObj.value) || querySelectorDeep(selectorObj.value);
      }

      if (selectorObj.type === "xpath") {
        let result = this.evaluateXPath(selectorObj.value);
        if (result) return result;
        
        // Fallback: try to extract ID from xpath and search in Shadow DOM
        const idMatch = selectorObj.value.match(/@id="([^"]+)"/);
        if (idMatch) {
          result = querySelectorDeep(`#${idMatch[1]}`);
          if (result) return result;
        }
        
        return null;
      }

      // Handle Shadow DOM selectors
      if (selectorObj.type === "shadow") {
        return this.findElementInShadow(selectorObj);
      }

      return null;
    }

    // Find element in Shadow DOM
    findElementInShadow(selectorObj) {
      if (!selectorObj.hostSelector || !selectorObj.innerSelector) return null;

      // Parse the host path (delimited by >>>)
      const hostPath = selectorObj.hostSelector.split(" >>> ");
      let currentRoot = document;

      // Traverse through shadow hosts
      for (const hostSel of hostPath) {
        const host = currentRoot.querySelector(hostSel.trim());
        if (!host) return null;
        if (!host.shadowRoot) return null;
        currentRoot = host.shadowRoot;
      }

      // Now query the inner selector in the final shadow root
      try {
        return currentRoot.querySelector(selectorObj.innerSelector);
      } catch {
        return null;
      }
    }

    // Find all elements by selector
    findAllElements(selectorObj) {
      if (!selectorObj) return [];

      if (typeof selectorObj === "string") {
        // Try normal + deep search
        const normal = safeQueryAll(selectorObj);
        if (normal.length > 0) return normal;
        return querySelectorAllDeep(selectorObj);
      }

      if (selectorObj.type === "css") {
        const normal = safeQueryAll(selectorObj.value);
        if (normal.length > 0) return normal;
        return querySelectorAllDeep(selectorObj.value);
      }

      // Handle Shadow DOM selectors
      if (selectorObj.type === "shadow") {
        const el = this.findElementInShadow(selectorObj);
        return el ? [el] : [];
      }

      if (selectorObj.type === "xpath") {
        try {
          const result = document.evaluate(
            selectorObj.value,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          const els = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            els.push(result.snapshotItem(i));
          }
          return els;
        } catch {
          return [];
        }
      }

      return [];
    }

    // Clear cache
    clearCache() {
      this.cache = new WeakMap();
    }
  }

  const selectorEngine = new SelectorEngine();

  // ============================================================
  // ENHANCED ELEMENT PICKER
  // ============================================================

  class ElementPicker {
    constructor() {
      this.overlay = null;
      this.infoBox = null;
      this.currentElement = null;
      this.isActive = false;
      this.callbacks = {
        onPick: null,
        onHover: null,
        onCancel: null,
      };

      // Keyboard navigation
      this.navigationMode = false;

      // Lasso selection
      this.lasso = {
        active: false,
        startX: 0,
        startY: 0,
        box: null,
      };

      // Bound handlers
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onMouseDown = this._onMouseDown.bind(this);
      this._onMouseUp = this._onMouseUp.bind(this);
      this._onScroll = throttle(this._onScroll.bind(this), 50);
    }

    start(callbacks = {}) {
      if (this.isActive) return;
      this.isActive = true;
      this.callbacks = { ...this.callbacks, ...callbacks };

      this._createOverlay();
      this._addEventListeners();
    }

    stop() {
      if (!this.isActive) return;
      this.isActive = false;

      this._removeEventListeners();
      this._removeOverlay();
      this._endLasso();
      this.currentElement = null;
    }

    _createOverlay() {
      // Overlay for visual cursor only - NOT blocking events
      // Events go through to elements, we catch them in capture phase
      this.overlay = document.createElement("div");
      this.overlay.id = OVERLAY_ID;
      this.overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 2147483640;
        cursor: crosshair;
        pointer-events: none;
      `;

      // Info box
      this.infoBox = document.createElement("div");
      this.infoBox.style.cssText = `
        position: fixed;
        z-index: 2147483645;
        background: #292a2d;
        color: #e8eaed;
        padding: 8px 12px;
        border-radius: 4px;
        border: 1px solid #5f6368;
        font-family: 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        line-height: 1.4;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
        max-width: 320px;
        word-break: break-all;
        display: none;
      `;

      // Highlight box
      this.highlightBox = document.createElement("div");
      this.highlightBox.style.cssText = `
        position: fixed;
        z-index: 2147483642;
        pointer-events: none;
        border: 2px solid #00d4ff;
        background: rgba(0, 212, 255, 0.08);
        box-shadow: 0 0 0 1px rgba(0,0,0,0.2), inset 0 0 20px rgba(0, 212, 255, 0.1);
        transition: all 0.1s ease-out;
      `;

      // Margin/padding indicators
      this.marginBox = document.createElement("div");
      this.marginBox.style.cssText = `
        position: fixed;
        z-index: 2147483641;
        pointer-events: none;
        border: 1px dashed rgba(255, 152, 0, 0.5);
        background: rgba(255, 152, 0, 0.05);
      `;

      document.documentElement.appendChild(this.overlay);
      document.documentElement.appendChild(this.marginBox);
      document.documentElement.appendChild(this.highlightBox);
      document.documentElement.appendChild(this.infoBox);
    }

    _removeOverlay() {
      this.overlay?.remove();
      this.infoBox?.remove();
      this.highlightBox?.remove();
      this.marginBox?.remove();
      this.overlay = null;
      this.infoBox = null;
      this.highlightBox = null;
      this.marginBox = null;
    }

    _addEventListeners() {
      document.addEventListener("mousemove", this._onMouseMove, true);
      document.addEventListener("click", this._onClick, true);
      document.addEventListener("keydown", this._onKeyDown, true);
      document.addEventListener("mousedown", this._onMouseDown, true);
      document.addEventListener("mouseup", this._onMouseUp, true);
      window.addEventListener("scroll", this._onScroll, true);
    }

    _removeEventListeners() {
      document.removeEventListener("mousemove", this._onMouseMove, true);
      document.removeEventListener("click", this._onClick, true);
      document.removeEventListener("keydown", this._onKeyDown, true);
      document.removeEventListener("mousedown", this._onMouseDown, true);
      document.removeEventListener("mouseup", this._onMouseUp, true);
      window.removeEventListener("scroll", this._onScroll, true);
    }

    _onScroll() {
      if (this.currentElement) {
        this._updateHighlight(this.currentElement);
      }
    }

    _onMouseMove(e) {
      // Check if mouse is over the F12 Tech panel
      const panel = document.getElementById(ROOT_ID);
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        if (
          e.clientX >= panelRect.left &&
          e.clientX <= panelRect.right &&
          e.clientY >= panelRect.top &&
          e.clientY <= panelRect.bottom
        ) {
          // Mouse is over panel, hide highlight and don't process
          this._hideHighlight();
          return;
        }
      }

      if (this.lasso.active) {
        this._updateLasso(e.clientX, e.clientY);
        return;
      }

      // Use composedPath to get element through closed Shadow DOM
      let el = getDeepestFromEvent(e);
      
      // Fallback to elementFromPoint if composedPath doesn't work
      if (!el) {
        el = deepElementFromPoint(e.clientX, e.clientY);
      }

      if (!el || !isEditableTarget(el)) {
        this._hideHighlight();
        return;
      }

      if (el !== this.currentElement) {
        this.currentElement = el;
        this._updateHighlight(el);
        this._updateInfoBox(el, e.clientX, e.clientY);
        this.callbacks.onHover?.(el);
        
        // Debug: log selected element info
        // console.log("F12 Tech: Hovering element:", {
        //   tag: el.tagName,
        //   id: el.id,
        //   classes: el.className,
        //   text: el.textContent?.slice(0, 50),
        //   inShadow: isInShadowDOM(el),
        //   shadowHost: getShadowHost(el)?.tagName
        // });
      }
    }

    _onClick(e) {
      // Allow clicks on the F12 Tech panel to pass through
      const panel = document.getElementById(ROOT_ID);
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        if (
          e.clientX >= panelRect.left &&
          e.clientX <= panelRect.right &&
          e.clientY >= panelRect.top &&
          e.clientY <= panelRect.bottom
        ) {
          // Click is on panel, let it through
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (this.lasso.active) return;

      // Get element from composedPath (works with closed Shadow DOM)
      let el = getDeepestFromEvent(e);
      if (!el || !isEditableTarget(el)) {
        el = this.currentElement;
      }

      if (!el) return;

      // Debug: log picked element
      // console.log("F12 Tech: Picked element:", {
      //   tag: el.tagName,
      //   id: el.id,
      //   classes: el.className,
      //   text: el.textContent?.slice(0, 100),
      //   html: el.innerHTML?.slice(0, 100),
      //   inShadow: isInShadowDOM(el)
      // });

      const multi = e.shiftKey || e.ctrlKey || e.metaKey;
      this.callbacks.onPick?.(el, multi);
    }

    _onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onCancel?.();
        return;
      }

      // Keyboard navigation when element is selected
      if (this.currentElement && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        this._navigateElement(e.key);
      }

      // Enter to confirm selection
      if (e.key === "Enter" && this.currentElement) {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.onPick?.(this.currentElement, e.shiftKey);
      }
    }

    _navigateElement(key) {
      let next = null;
      const el = this.currentElement;

      switch (key) {
        case "ArrowUp":
          next = el.parentElement;
          break;
        case "ArrowDown":
          next = el.firstElementChild;
          break;
        case "ArrowLeft":
          next = el.previousElementSibling;
          break;
        case "ArrowRight":
          next = el.nextElementSibling;
          break;
      }

      if (next && isEditableTarget(next)) {
        this.currentElement = next;
        this._updateHighlight(next);
        const rect = next.getBoundingClientRect();
        this._updateInfoBox(next, rect.left + rect.width / 2, rect.top);
        this.callbacks.onHover?.(next);
      }
    }

    _onMouseDown(e) {
      // Allow interactions on the F12 Tech panel
      const panel = document.getElementById(ROOT_ID);
      if (panel) {
        const panelRect = panel.getBoundingClientRect();
        if (
          e.clientX >= panelRect.left &&
          e.clientX <= panelRect.right &&
          e.clientY >= panelRect.top &&
          e.clientY <= panelRect.bottom
        ) {
          return; // Let panel handle it
        }
      }

      if (e.altKey && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this._startLasso(e.clientX, e.clientY);
      }
    }

    _onMouseUp(e) {
      if (this.lasso.active) {
        e.preventDefault();
        e.stopPropagation();
        this._endLasso();
      }
    }

    _startLasso(x, y) {
      this.lasso.active = true;
      this.lasso.startX = x;
      this.lasso.startY = y;
      this.lasso.box = document.createElement("div");
      this.lasso.box.style.cssText = `
        position: fixed;
        left: ${x}px; top: ${y}px;
        width: 0; height: 0;
        border: 2px solid #00ff88;
        background: rgba(0, 255, 136, 0.1);
        z-index: 2147483646;
        pointer-events: none;
      `;
      document.documentElement.appendChild(this.lasso.box);
      this._hideHighlight();
    }

    _updateLasso(x, y) {
      if (!this.lasso.active || !this.lasso.box) return;
      const left = Math.min(this.lasso.startX, x);
      const top = Math.min(this.lasso.startY, y);
      const width = Math.abs(x - this.lasso.startX);
      const height = Math.abs(y - this.lasso.startY);
      this.lasso.box.style.left = left + "px";
      this.lasso.box.style.top = top + "px";
      this.lasso.box.style.width = width + "px";
      this.lasso.box.style.height = height + "px";
    }

    _endLasso() {
      if (!this.lasso.active) return;

      const box = this.lasso.box?.getBoundingClientRect();
      this.lasso.box?.remove();
      this.lasso.active = false;
      this.lasso.box = null;

      if (!box || box.width < 5 || box.height < 5) return;

      // Find elements in lasso area
      const hits = new Set();
      const step = 20;
      const startX = clamp(Math.floor(box.left), 0, window.innerWidth);
      const endX = clamp(Math.floor(box.right), 0, window.innerWidth);
      const startY = clamp(Math.floor(box.top), 0, window.innerHeight);
      const endY = clamp(Math.floor(box.bottom), 0, window.innerHeight);

      this.overlay.style.pointerEvents = "none";

      for (let y = startY; y <= endY; y += step) {
        for (let x = startX; x <= endX; x += step) {
          const els = document.elementsFromPoint(x, y) || [];
          for (const el of els) {
            if (isEditableTarget(el)) {
              hits.add(el);
              break;
            }
          }
        }
      }

      this.overlay.style.pointerEvents = "auto";

      // Notify about lasso selection
      for (const el of hits) {
        this.callbacks.onPick?.(el, true);
      }
    }

    _updateHighlight(el) {
      if (!this.highlightBox || !this.marginBox) return;

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      // Main highlight
      this.highlightBox.style.display = "block";
      this.highlightBox.style.left = rect.left + "px";
      this.highlightBox.style.top = rect.top + "px";
      this.highlightBox.style.width = rect.width + "px";
      this.highlightBox.style.height = rect.height + "px";

      // Margin box
      const marginTop = parseFloat(style.marginTop) || 0;
      const marginRight = parseFloat(style.marginRight) || 0;
      const marginBottom = parseFloat(style.marginBottom) || 0;
      const marginLeft = parseFloat(style.marginLeft) || 0;

      if (marginTop || marginRight || marginBottom || marginLeft) {
        this.marginBox.style.display = "block";
        this.marginBox.style.left = rect.left - marginLeft + "px";
        this.marginBox.style.top = rect.top - marginTop + "px";
        this.marginBox.style.width = rect.width + marginLeft + marginRight + "px";
        this.marginBox.style.height = rect.height + marginTop + marginBottom + "px";
      } else {
        this.marginBox.style.display = "none";
      }
    }

    _hideHighlight() {
      if (this.highlightBox) this.highlightBox.style.display = "none";
      if (this.marginBox) this.marginBox.style.display = "none";
      if (this.infoBox) this.infoBox.style.display = "none";
      this.currentElement = null;
    }

    _updateInfoBox(el, mouseX, mouseY) {
      if (!this.infoBox) return;

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : "";
      const classes = el.classList.length
        ? "." + Array.from(el.classList).slice(0, 3).join(".")
        : "";

      const style = window.getComputedStyle(el);
      const dims = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

      const selectorInfo = selectorEngine.getSelector(el);
      const selectorPreview =
        selectorInfo?.value?.length > 60
          ? selectorInfo.value.slice(0, 60) + "…"
          : selectorInfo?.value || "?";

      const inShadow = isInShadowDOM(el);
      const shadowBadge = inShadow ? '<span style="background:#9333ea;color:#fff;padding:1px 4px;border-radius:3px;font-size:9px;margin-left:4px;">SHADOW</span>' : '';

      this.infoBox.innerHTML = `
        <div style="font-weight: 700; color: #8ab4f8; margin-bottom: 2px;">
          ${tag}${id}${classes}${shadowBadge}
        </div>
        <div style="color: #bdc1c6;">
          ${dims}px | ${selectorPreview}
        </div>
      `;

      this.infoBox.style.display = "block";

      // Position info box
      const boxWidth = 300;
      const boxHeight = 100;
      let left = mouseX + 15;
      let top = mouseY + 15;

      if (left + boxWidth > window.innerWidth) {
        left = mouseX - boxWidth - 15;
      }
      if (top + boxHeight > window.innerHeight) {
        top = mouseY - boxHeight - 15;
      }

      this.infoBox.style.left = Math.max(5, left) + "px";
      this.infoBox.style.top = Math.max(5, top) + "px";
    }
  }

  // ============================================================
  // STORAGE
  // ============================================================

  async function storageGet(key) {
    return await chrome.storage.local.get(key);
  }

  async function storageSet(obj) {
    return await chrome.storage.local.set(obj);
  }

  async function storageRemove(key) {
    return await chrome.storage.local.remove(key);
  }

  // ============================================================
  // PATCH SYSTEM
  // ============================================================

  function patchKey(p) {
    const selectorStr = typeof p.selector === "string" ? p.selector : JSON.stringify(p.selector);
    return [selectorStr, p.type, p.name || ""].join("::");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  // Cache for patch -> element mapping (cleared when DOM changes significantly)
  const elementCache = new Map();
  
  function applyOnePatch(patch) {
    const cacheKey = JSON.stringify(patch.selector);
    
    // Try cache first
    let el = elementCache.get(cacheKey);
    
    // Validate cached element is still in DOM
    if (el && !document.contains(el)) {
      elementCache.delete(cacheKey);
      el = null;
    }
    
    // Find element if not cached
    if (!el) {
      el = selectorEngine.findElement(patch.selector);
      
      // Fallback: try deep search if not found
      if (!el && patch.selector) {
        if (patch.selector.type === "css") {
          el = querySelectorDeep(patch.selector.value);
        } else if (patch.selector.type === "xpath") {
          const idMatch = patch.selector.value?.match?.(/@id="([^"]+)"/);
          if (idMatch) {
            el = querySelectorDeep(`#${idMatch[1]}`);
          }
        }
      }
      
      // Cache the result
      if (el) {
        elementCache.set(cacheKey, el);
      }
    }
    
    if (!el) return 0;
    if (!isEditableTarget(el)) return 0;

    // Skip if already patched with same value
    if (el.dataset.f12techPatched === "1" && el.dataset.f12techLastValue === String(patch.value)) {
      return 1;
    }

    try {
      if (patch.type === "text") {
        el.textContent = patch.value ?? "";
      } else if (patch.type === "html") {
        el.innerHTML = patch.value ?? "";
      } else if (patch.type === "attr") {
        if (!patch.name) return 0;
        if (patch.value === null || patch.value === undefined || patch.value === "") {
          el.removeAttribute(patch.name);
        } else {
          el.setAttribute(patch.name, String(patch.value));
        }
      } else if (patch.type === "style_append") {
        const v = String(patch.value ?? "").trim();
        if (v) {
          const cssProps = v.split(";").filter(Boolean);
          for (const prop of cssProps) {
            const [name, val] = prop.split(":").map(s => s.trim());
            if (name && val) {
              el.style.setProperty(name, val.replace(/!important/gi, "").trim(), "important");
            }
          }
        }
      } else if (patch.type === "style_replace") {
        el.removeAttribute("style");
        const v = String(patch.value ?? "").trim();
        if (v) {
          const cssProps = v.split(";").filter(Boolean);
          for (const prop of cssProps) {
            const [name, val] = prop.split(":").map(s => s.trim());
            if (name && val) {
              el.style.setProperty(name, val.replace(/!important/gi, "").trim(), "important");
            }
          }
        }
      } else if (patch.type === "hide") {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
      } else if (patch.type === "remove") {
        el.remove();
        return 1;
      }

      el.dataset.f12techPatched = "1";
      el.dataset.f12techLastValue = String(patch.value);
      // Remove pending state - element is now visible
      delete el.dataset.f12techPending;
      return 1;
    } catch (e) {
      return 0;
    }
  }

  // ============================================================
  // MAIN STATE & UI
  // ============================================================

  let state = {
    enabled: false,
    picking: false,
    scope: "full",
    patches: [],
    selected: new Set(),
    undoStack: [],
    maxUndo: 20,
  };

  const elementPicker = new ElementPicker();

  function clearSelection() {
    for (const el of state.selected) {
      if (el?.dataset) delete el.dataset.f12techSelected;
    }
    state.selected.clear();
    updateSelectionUI();
  }

  function toggleSelectElement(el, multi = true) {
    if (!el || !isEditableTarget(el)) return;

    if (!multi) {
      clearSelection();
    }

    if (state.selected.has(el)) {
      state.selected.delete(el);
      if (el.dataset) delete el.dataset.f12techSelected;
    } else {
      state.selected.add(el);
      if (el.dataset) el.dataset.f12techSelected = "1";
    }

    updateSelectionUI();
  }

  function selectedArray() {
    return Array.from(state.selected).filter((el) => el && document.contains(el));
  }

  // ============================================================
  // ENHANCED UI
  // ============================================================

  let uiElements = {};

  function injectGlobalStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-f12tech-selected="1"] {
        outline: 3px solid #00ff88 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 12px rgba(0, 255, 136, 0.4) !important;
      }
      [data-f12tech-patched="1"] {
        /* Subtle indicator for patched elements */
      }
    `;
    document.documentElement.appendChild(style);
  }

  function mountUI() {
    if (document.getElementById(ROOT_ID)) return;

    injectGlobalStyles();

    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.cssText = `
      position: fixed;
      right: 16px;
      top: 16px;
      z-index: 2147483647;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
    `;

    const shadow = host.attachShadow({ mode: "open" });

    const css = document.createElement("style");
    css.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      
      .panel {
        width: 360px;
        max-height: 85vh;
        overflow: hidden;
        background: #292a2d; /* Chrome Dark Theme BG */
        color: #e8eaed;
        border: 1px solid #5f6368;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
      }

      .panel.minimized .panel-body { display: none; }
      .panel.minimized { max-height: none; width: auto; min-width: 200px; }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #35363a;
        border-bottom: 1px solid #5f6368;
        cursor: move;
        user-select: none;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .logo {
        font-weight: 600;
        font-size: 13px;
        color: #e8eaed;
      }

      .status-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .status-badge.on {
        background: #1e8e3e; /* Green */
        color: #fff;
      }
      .status-badge.pick {
        background: #f9ab00; /* Yellow/Orange */
        color: #202124;
      }
      .status-badge.off {
        background: #5f6368;
        color: #fff;
      }

      .header-buttons {
        display: flex;
        gap: 4px;
      }

      .icon-btn {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: #9aa0a6;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .icon-btn:hover {
        background: rgba(255,255,255,0.1);
        color: #e8eaed;
      }
      .icon-btn.danger:hover {
        background: #d93025;
        color: #fff;
      }

      /* Panel Body */
      .panel-body {
        overflow-y: auto;
        flex: 1;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Buttons & Actions */
      .action-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 4px;
        border: 1px solid #5f6368;
        background: #35363a;
        color: #e8eaed;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.1s;
      }
      .btn:hover {
        background: #3c4043;
        border-color: #5f6368;
      }
      .btn.primary {
        background: #8ab4f8; /* Blue */
        border-color: #8ab4f8;
        color: #202124;
        font-weight: 600;
      }
      .btn.primary:hover {
        background: #aecbfa;
        border-color: #aecbfa;
      }
      .btn.danger {
        color: #f28b82;
        border-color: rgba(242, 139, 130, 0.5);
      }
      .btn.danger:hover {
        background: rgba(242, 139, 130, 0.1);
      }
      .btn.picking {
        background: #f9ab00;
        border-color: #f9ab00;
        color: #202124;
      }

      /* Cards / Sections */
      .section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .section-title {
        font-size: 11px;
        font-weight: 600;
        color: #9aa0a6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Tabs */
      .tabs {
        display: flex;
        border-bottom: 1px solid #5f6368;
        margin-bottom: 8px;
      }

      .tab {
        padding: 6px 12px;
        font-size: 12px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: #9aa0a6;
        cursor: pointer;
      }
      .tab:hover {
        color: #e8eaed;
      }
      .tab.active {
        color: #8ab4f8;
        border-bottom-color: #8ab4f8;
      }

      /* Inputs */
      .form-group {
        margin-bottom: 8px;
      }
      label {
        display: block;
        font-size: 11px;
        color: #9aa0a6;
        margin-bottom: 4px;
      }
      input, select, textarea {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
        background: #202124;
        border: 1px solid #5f6368;
        border-radius: 4px;
        color: #e8eaed;
        outline: none;
        font-family: inherit;
      }
      input:focus, select:focus, textarea:focus {
        border-color: #8ab4f8;
      }
      textarea {
        min-height: 80px;
        resize: vertical;
        font-family: Consolas, 'Courier New', monospace;
      }

      /* Quick Actions Grid */
      .quick-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }

      /* Lists */
      .list-container {
        max-height: 150px;
        overflow-y: auto;
        border: 1px solid #5f6368;
        border-radius: 4px;
        background: #202124;
      }
      .list-item {
        padding: 6px 8px;
        border-bottom: 1px solid #3c4043;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .list-item:last-child { border-bottom: none; }
      
      .item-info { flex: 1; min-width: 0; }
      .item-type { font-size: 10px; font-weight: 700; color: #8ab4f8; }
      .item-sel { font-size: 11px; color: #9aa0a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }

      /* Info Box */
      .info-box {
        background: #3c4043;
        padding: 8px;
        border-radius: 4px;
        font-size: 11px;
        color: #bdc1c6;
        line-height: 1.4;
      }
      
      .kbd {
        background: #202124;
        padding: 2px 4px;
        border-radius: 3px;
        border: 1px solid #5f6368;
        font-family: monospace;
      }

      /* Style Presets */
      .style-preset {
        padding: 3px 8px;
        font-size: 10px;
        background: #3c4043;
        border: 1px solid #5f6368;
        border-radius: 4px;
        color: #e8eaed;
        cursor: pointer;
      }
      .style-preset:hover {
        background: #5f6368;
      }

      /* Footer */
      .footer {
        padding: 8px 12px;
        border-top: 1px solid #5f6368;
        display: flex;
        justify-content: flex-end;
        background: #35363a;
      }

      /* Notification animation */
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        15% { opacity: 1; transform: translateX(-50%) translateY(0); }
        85% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      }
    `;

    const wrapper = document.createElement("div");
    wrapper.className = "panel";
    wrapper.innerHTML = `
      <div class="header" id="panelHeader">
        <div class="header-left">
          <div class="logo">F12 Tech</div>
          <div class="status-badge on" id="statusBadge">ON</div>
        </div>
        <div class="header-buttons">
          <button class="icon-btn" id="btnMinimize" title="Minimize">−</button>
          <button class="icon-btn danger" id="btnClose" title="Close">×</button>
        </div>
      </div>

      <div class="panel-body">
        <!-- Main Actions -->
        <div class="action-row">
          <button class="btn primary" id="btnPick" style="flex: 2;">
            🎯 Pick Element
          </button>
          <button class="btn" id="btnUndo" title="Undo" style="flex: 1;">
            ↩ Undo
          </button>
          <button class="btn" id="btnClearSel" title="Clear Selection" style="flex: 0;">
            ✕
          </button>
      </div>

        <!-- Scope -->
        <div class="section">
          <div class="section-title">Save Scope</div>
          <select id="scopeSelect">
            <option value="full">🔗 Exact URL (Full)</option>
            <option value="path">📁 Path Only</option>
            <option value="origin">🌐 Domain Only</option>
        </select>
        </div>

        <!-- Main Tabs -->
        <div class="tabs">
          <button class="tab active" data-tab="edit">Edit</button>
          <button class="tab" data-tab="quick">Quick</button>
          <button class="tab" data-tab="history">History</button>
      </div>

        <!-- Tab: Edit -->
        <div class="tab-content active" id="tabEdit">
          <!-- Sub Tabs -->
          <div class="tabs" style="margin-bottom: 8px; border-bottom: none;">
            <button class="tab active" data-subtab="text" style="border: 1px solid #5f6368; border-radius: 4px; margin-right: 4px; flex:1;">Text</button>
            <button class="tab" data-subtab="html" style="border: 1px solid #5f6368; border-radius: 4px; margin-right: 4px; flex:1;">HTML</button>
            <button class="tab" data-subtab="style" style="border: 1px solid #5f6368; border-radius: 4px; margin-right: 4px; flex:1;">Style</button>
            <button class="tab" data-subtab="attr" style="border: 1px solid #5f6368; border-radius: 4px; flex:1;">Attr</button>
      </div>

          <!-- Content: Text -->
          <div class="subtab-content active" id="subtabText">
            <div class="form-group">
              <label style="font-size: 11px; color: #9aa0a6; margin-bottom: 4px; display: block;">Text Content:</label>
              <textarea id="inputText" placeholder="Pick an element then enter new text..."></textarea>
        </div>
            <button class="btn primary" id="applyText" style="width: 100%;">Apply Text</button>
      </div>

          <!-- Content: HTML -->
          <div class="subtab-content" id="subtabHtml" style="display:none;">
            <div style="margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="style-preset html-preset" data-html="<b>text</b>">Bold</button>
              <button class="style-preset html-preset" data-html="<i>text</i>">Italic</button>
              <button class="style-preset html-preset" data-html="<u>text</u>">Underline</button>
              <button class="style-preset html-preset" data-html="<s>text</s>">Strike</button>
              <button class="style-preset html-preset" data-html="<a href='#'>link</a>">Link</button>
              <button class="style-preset html-preset" data-html="<span style='color:red'>text</span>">Red</button>
              <button class="style-preset html-preset" data-html="<br>">BR</button>
              <button class="style-preset html-preset" data-html="">Clear</button>
        </div>
            <div class="form-group">
              <label style="font-size: 11px; color: #9aa0a6; margin-bottom: 4px; display: block;">innerHTML:</label>
              <textarea id="inputHtml" placeholder="<b>Bold</b> <i>Italic</i> ..."></textarea>
            </div>
            <button class="btn primary" id="applyHtml" style="width: 100%;">Apply HTML</button>
      </div>

          <!-- Content: Style -->
          <div class="subtab-content" id="subtabStyle" style="display:none;">
            <div style="margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="style-preset" data-style="display: none;">Hide</button>
              <button class="style-preset" data-style="visibility: hidden;">Invisible</button>
              <button class="style-preset" data-style="opacity: 0;">Opacity 0</button>
              <button class="style-preset" data-style="color: red;">Red</button>
              <button class="style-preset" data-style="background: yellow;">Yellow BG</button>
              <button class="style-preset" data-style="font-size: 20px;">Big Text</button>
              <button class="style-preset" data-style="font-weight: bold;">Bold</button>
              <button class="style-preset" data-style="text-decoration: line-through;">Strikethrough</button>
            </div>
            <div class="form-group">
              <label style="font-size: 11px; color: #9aa0a6; margin-bottom: 4px; display: block;">CSS Styles (auto adds !important):</label>
              <textarea id="inputStyle" placeholder="color: red; font-size: 20px;"></textarea>
            </div>
            <div class="action-row">
              <button class="btn primary" id="applyStyleAppend" style="flex: 1;">+ Append</button>
              <button class="btn" id="applyStyleReplace" style="flex: 1;">Replace</button>
        </div>
      </div>

          <!-- Content: Attr -->
          <div class="subtab-content" id="subtabAttr" style="display:none;">
            <div style="margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="style-preset attr-preset" data-attr="href">href</button>
              <button class="style-preset attr-preset" data-attr="src">src</button>
              <button class="style-preset attr-preset" data-attr="alt">alt</button>
              <button class="style-preset attr-preset" data-attr="title">title</button>
              <button class="style-preset attr-preset" data-attr="class">class</button>
              <button class="style-preset attr-preset" data-attr="id">id</button>
              <button class="style-preset attr-preset" data-attr="target">target</button>
              <button class="style-preset attr-preset" data-attr="disabled">disabled</button>
        </div>
            <div style="margin-bottom: 8px; max-height: 80px; overflow-y: auto; border: 1px solid #3c4043; border-radius: 4px;" id="attrList">
              <div style="color:#9aa0a6;font-size:11px;padding:8px;text-align:center;">Click an element to view attributes</div>
        </div>
            <div class="form-group">
              <input type="text" id="inputAttrName" placeholder="Attribute name (e.g. href, src, class)">
            </div>
            <div class="form-group">
              <input type="text" id="inputAttrValue" placeholder="New value (leave empty to remove)">
            </div>
            <button class="btn primary" id="applyAttr" style="width: 100%;">Apply Attribute</button>
          </div>
      </div>

        <!-- Tab: Quick -->
        <div class="tab-content" id="tabQuick" style="display:none;">
          <div class="quick-grid">
            <button class="btn" id="quickHide">🙈 Hide</button>
            <button class="btn danger" id="quickRemove">🗑️ Remove</button>
            <button class="btn" id="quickCopy">📋 Copy Selector</button>
            <button class="btn" id="quickInspect">🔍 Inspect</button>
        </div>
          <div class="info-box" style="margin-top: 12px;">
            <div><span class="kbd">Shift</span> + Click: Multi-select</div>
            <div><span class="kbd">Alt</span> + Drag: Lasso select</div>
            <div><span class="kbd">Esc</span>: Cancel</div>
        </div>
      </div>

        <!-- Tab: History -->
        <div class="tab-content" id="tabHistory" style="display:none;">
          <div class="list-container" id="historyList">
            <div style="padding:12px; text-align:center; color:#9aa0a6;">No changes yet</div>
          </div>
          <div class="action-row" style="margin-top: 8px;">
            <button class="btn danger" id="clearAllPatches" style="flex: 1;">Clear All</button>
            <button class="btn" id="exportPatches" style="flex: 1;">Export</button>
            <button class="btn" id="importPatches" style="flex: 1;">Import</button>
          </div>
          <textarea id="jsonBox" style="display: none; margin-top: 8px;" placeholder="JSON data..."></textarea>
      </div>

        <!-- Selection Info -->
        <div class="section" style="margin-top: auto; padding-top: 12px; border-top: 1px solid #3c4043;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
             <div class="section-title">Selected: <span id="selectionCount" style="color:#e8eaed;">0</span></div>
          </div>
          <div id="selectionMeta" style="font-family:monospace; font-size:11px; color:#9aa0a6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            (No element selected)
          </div>
        </div>

        <!-- Footer -->
        <div class="footer" style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #3c4043; text-align: center; font-size: 10px; color: #9aa0a6;">
          <div style="display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span>Developed by <a href="https://github.com/diepvantien" target="_blank" rel="noopener" style="color: #8ab4f8; text-decoration: none;">DIEP VAN TIEN</a></span>
            <span style="color: #5f6368;">|</span>
            <span>Donate: <a href="https://buymeacoffee.com/tixuno" target="_blank" rel="noopener" style="color: #ffdd00; text-decoration: none;">Buymeacoffee</a> · <a href="https://me.momo.vn/OeIGiJsViJfDfntmiRId" target="_blank" rel="noopener" style="color: #d82d8b; text-decoration: none;">MoMo</a></span>
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(css);
    shadow.appendChild(wrapper);
    document.documentElement.appendChild(host);

    // Store references
    uiElements = {
      host,
      shadow,
      wrapper,
      statusBadge: shadow.getElementById("statusBadge"),
      btnPick: shadow.getElementById("btnPick"),
      btnClearSel: shadow.getElementById("btnClearSel"),
      btnUndo: shadow.getElementById("btnUndo"),
      btnMinimize: shadow.getElementById("btnMinimize"),
      btnClose: shadow.getElementById("btnClose"),
      scopeSelect: shadow.getElementById("scopeSelect"),
      inputText: shadow.getElementById("inputText"),
      inputHtml: shadow.getElementById("inputHtml"),
      inputStyle: shadow.getElementById("inputStyle"),
      inputAttrName: shadow.getElementById("inputAttrName"),
      inputAttrValue: shadow.getElementById("inputAttrValue"),
      attrList: shadow.getElementById("attrList"),
      selectionCount: shadow.getElementById("selectionCount"),
      selectionMeta: shadow.getElementById("selectionMeta"),
      historyList: shadow.getElementById("historyList"),
      jsonBox: shadow.getElementById("jsonBox"),
    };

    // Wire up events
    wireUIEvents(shadow);

    // Make panel draggable
    makeDraggable(host, shadow.getElementById("panelHeader"));
  }

  function wireUIEvents(shadow) {
    const $ = (id) => shadow.getElementById(id);

    // Close / Minimize
    $("btnClose").addEventListener("click", () => disableEditor());
    $("btnMinimize").addEventListener("click", () => {
      uiElements.wrapper.classList.toggle("minimized");
      $("btnMinimize").textContent = uiElements.wrapper.classList.contains("minimized") ? "+" : "−";
    });

    // Pick button
    $("btnPick").addEventListener("click", () => {
      if (state.picking) {
        stopPicking();
      } else {
        startPicking();
      }
    });

    // Clear selection
    $("btnClearSel").addEventListener("click", () => clearSelection());

    // Undo
    $("btnUndo").addEventListener("click", () => undoLast());

    // Scope
    $("scopeSelect").addEventListener("change", async (e) => {
      state.scope = e.target.value;
      await loadPatchesForScope();
      applyAllPatches();
      renderHistory();
    });

    // Main tabs
    shadow.querySelectorAll(".tabs .tab[data-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        shadow.querySelectorAll(".tabs .tab[data-tab]").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        shadow.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        shadow.getElementById("tab" + capitalize(tab.dataset.tab)).classList.add("active");
      });
    });

    // Sub tabs (Text/HTML/Style/Attr)
    shadow.querySelectorAll("[data-subtab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        shadow.querySelectorAll("[data-subtab]").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        shadow.querySelectorAll(".subtab-content").forEach((c) => (c.style.display = "none"));
        shadow.getElementById("subtab" + capitalize(tab.dataset.subtab)).style.display = "block";
      });
    });

    // Apply buttons
    $("applyText").addEventListener("click", () => applyToSelection("text", { value: $("inputText").value }));
    $("applyHtml").addEventListener("click", () => applyToSelection("html", { value: $("inputHtml").value }));
    
    // HTML presets - click to add to textarea or double-click to apply
    shadow.querySelectorAll(".html-preset").forEach(btn => {
      btn.addEventListener("click", () => {
        const html = btn.dataset.html;
        const input = $("inputHtml");
        if (input) {
          // Add to existing value
          input.value += html;
        }
      });
      // Double-click to apply immediately
      btn.addEventListener("dblclick", () => {
        const html = btn.dataset.html;
        applyToSelection("html", { value: html });
      });
    });
    
    $("applyStyleAppend").addEventListener("click", () =>
      applyToSelection("style_append", { value: $("inputStyle").value })
    );
    $("applyStyleReplace").addEventListener("click", () =>
      applyToSelection("style_replace", { value: $("inputStyle").value })
    );
    
    // Style presets - click to add to textarea or apply directly
    shadow.querySelectorAll(".style-preset").forEach(btn => {
      btn.addEventListener("click", () => {
        const style = btn.dataset.style;
        const input = $("inputStyle");
        if (input) {
          // Add to existing value
          const current = input.value.trim();
          input.value = current ? current + "; " + style : style;
        }
      });
      // Double-click to apply immediately
      btn.addEventListener("dblclick", () => {
        const style = btn.dataset.style;
        applyToSelection("style_append", { value: style });
      });
    });
    
    // Attr presets - click to fill the name field
    shadow.querySelectorAll(".attr-preset").forEach(btn => {
      btn.addEventListener("click", () => {
        const attrName = btn.dataset.attr;
        const nameInput = $("inputAttrName");
        const valueInput = $("inputAttrValue");
        if (nameInput) {
          nameInput.value = attrName;
          // Try to get current value from first selected element
          const arr = selectedArray();
          if (arr.length > 0 && valueInput) {
            const currentVal = arr[0].getAttribute(attrName);
            valueInput.value = currentVal || "";
          }
        }
      });
    });
    
    $("applyAttr").addEventListener("click", () => {
      const name = $("inputAttrName").value.trim();
      if (!name) return alert("Enter attribute name!");
      applyToSelection("attr", { name, value: $("inputAttrValue").value || null });
    });

    // Quick actions
    $("quickHide").addEventListener("click", () => applyToSelection("hide", {}));
    $("quickRemove").addEventListener("click", () => {
      if (confirm("Remove selected elements from DOM?")) {
        applyToSelection("remove", {});
      }
    });
    $("quickCopy").addEventListener("click", () => {
      const arr = selectedArray();
      if (!arr.length) return alert("No element selected!");
      const selectors = arr.map((el) => {
        const s = selectorEngine.getSelector(el);
        return s?.value || "?";
      });
      navigator.clipboard.writeText(selectors.join("\n"));
      alert("Copied " + selectors.length + " selector(s)!");
    });
    $("quickInspect").addEventListener("click", () => {
      const arr = selectedArray();
      if (!arr.length) return alert("No element selected!");
      // console.log("F12 Tech - Selected elements:", arr);
      // arr.forEach((el, i) => {
      //   console.log(`[${i}]`, el, selectorEngine.getSelector(el));
      // });
      alert("Logged to Console. Open DevTools (F12) to see.");
    });

    // History actions
    $("clearAllPatches").addEventListener("click", async () => {
      if (!confirm("Clear all saved changes for this scope?")) return;
      const key = PATCH_STORE_PREFIX + makeScopeKey(state.scope);
      await storageRemove(key);
      state.patches = [];
      renderHistory();
      alert("Cleared!");
    });

    $("exportPatches").addEventListener("click", () => {
      $("jsonBox").style.display = "block";
      $("jsonBox").value = JSON.stringify(
        {
        scope: state.scope,
        scopeKey: makeScopeKey(state.scope),
        exportedAt: nowISO(),
          patches: state.patches,
        },
        null,
        2
      );
      $("jsonBox").select();
    });

    $("importPatches").addEventListener("click", async () => {
      $("jsonBox").style.display = "block";
      const val = $("jsonBox").value.trim();
      if (!val) {
        $("jsonBox").placeholder = "Paste JSON here then click Import again...";
        return;
      }
      try {
        const parsed = JSON.parse(val);
        if (!Array.isArray(parsed.patches)) throw new Error("Invalid format");
        state.patches = parsed.patches;
        await savePatchesForScope();
        applyAllPatches();
        renderHistory();
        alert("Import successful!");
      } catch (e) {
        alert("Import error: " + e.message);
      }
    });
  }

  // Show notification in the UI
  function showNotification(message, type = "success") {
    if (!uiElements.wrapper) return;
    
    // Remove existing notification
    const existing = uiElements.wrapper.querySelector(".f12-notification");
    if (existing) existing.remove();
    
    const notif = document.createElement("div");
    notif.className = "f12-notification";
    notif.style.cssText = `
      position: absolute;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 999;
      animation: fadeInOut 2s ease forwards;
      white-space: nowrap;
      ${type === "success" ? "background: #137333; color: #fff;" : ""}
      ${type === "error" ? "background: #c5221f; color: #fff;" : ""}
      ${type === "info" ? "background: #1967d2; color: #fff;" : ""}
    `;
    notif.textContent = message;
    uiElements.wrapper.appendChild(notif);
    
    setTimeout(() => notif.remove(), 2000);
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = startLeft + dx + "px";
      element.style.top = startTop + dy + "px";
      element.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  function unmountUI() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    uiElements = {};
  }

  function updatePickingUI() {
    if (!uiElements.btnPick) return;

    if (state.picking) {
      uiElements.btnPick.innerHTML = "<span>⏹</span> Stop (ESC)";
      uiElements.btnPick.classList.add("picking");
      uiElements.btnPick.classList.remove("primary");
      uiElements.statusBadge.textContent = "PICK";
      uiElements.statusBadge.className = "status-badge pick";
    } else {
      uiElements.btnPick.innerHTML = "<span>🎯</span> Pick Element";
      uiElements.btnPick.classList.remove("picking");
      uiElements.btnPick.classList.add("primary");
      uiElements.statusBadge.textContent = "ON";
      uiElements.statusBadge.className = "status-badge on";
    }
  }

  function updateSelectionUI() {
    if (!uiElements.selectionCount || !uiElements.selectionMeta) return;

      const arr = selectedArray();
    uiElements.selectionCount.textContent = `${arr.length}`;

    if (arr.length === 0) {
      uiElements.selectionMeta.textContent = '(No selection)';
      // Clear inputs when no selection
      if (uiElements.inputText) uiElements.inputText.value = "";
      if (uiElements.inputHtml) uiElements.inputHtml.value = "";
      if (uiElements.inputStyle) uiElements.inputStyle.value = "";
      if (uiElements.inputAttrName) uiElements.inputAttrName.value = "";
      if (uiElements.inputAttrValue) uiElements.inputAttrValue.value = "";
      // Clear attr list
      if (uiElements.attrList) uiElements.attrList.innerHTML = "";
        return;
      }

    const lines = arr.slice(0, 3).map((el, i) => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : "";
      const cls = el.classList?.length ? "." + Array.from(el.classList).slice(0, 2).join(".") : "";
      return `${tag}${id}${cls}`;
    });

    const more = arr.length > 3 ? ` +${arr.length - 3}` : "";
    uiElements.selectionMeta.textContent = lines.join(", ") + more;

    // Auto-fill inputs with content from first selected element
    const firstEl = arr[0];
    if (firstEl) {
      // Fill Text input - get direct text content (not nested)
      if (uiElements.inputText) {
        // Try to get only direct text, not nested elements
        let directText = "";
        for (const node of firstEl.childNodes) {
          if (node.nodeType === 3) { // TEXT_NODE
            directText += node.textContent;
          }
        }
        uiElements.inputText.value = directText.trim() || firstEl.textContent || "";
      }
      
      // Fill HTML input
      if (uiElements.inputHtml) {
        uiElements.inputHtml.value = firstEl.innerHTML || "";
      }
      
      // Fill Style input - show inline style
      if (uiElements.inputStyle) {
        uiElements.inputStyle.value = firstEl.getAttribute("style") || "";
      }
      
      // Build attribute list for Attr tab
      buildAttributeList(firstEl);
    }
  }

  // Build a clickable list of attributes for the selected element
  function buildAttributeList(el) {
    if (!uiElements.attrList) return;
    
    const attrs = Array.from(el.attributes || []);
    if (attrs.length === 0) {
      uiElements.attrList.innerHTML = '<div style="color:#9aa0a6;font-size:11px;padding:4px;">No attributes</div>';
      return;
    }
    
    // Show common editable attributes first
    const priorityAttrs = ['href', 'src', 'alt', 'title', 'class', 'id', 'name', 'value', 'placeholder', 'data-'];
    const sortedAttrs = attrs.sort((a, b) => {
      const aP = priorityAttrs.findIndex(p => a.name.startsWith(p));
      const bP = priorityAttrs.findIndex(p => b.name.startsWith(p));
      if (aP !== -1 && bP === -1) return -1;
      if (aP === -1 && bP !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
    
    uiElements.attrList.innerHTML = sortedAttrs.slice(0, 10).map(attr => `
      <div class="attr-item" data-attr="${attr.name}" style="
        display: flex; justify-content: space-between; align-items: center;
        padding: 4px 6px; margin-bottom: 4px; background: #202124;
        border-radius: 4px; cursor: pointer; font-size: 11px;
      ">
        <span style="color: #8ab4f8; font-weight: 600;">${attr.name}</span>
        <span style="color: #9aa0a6; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${attr.value.slice(0, 30)}${attr.value.length > 30 ? '...' : ''}
        </span>
      </div>
    `).join('');
    
    // Add click handlers to fill the inputs
    uiElements.attrList.querySelectorAll('.attr-item').forEach(item => {
      item.addEventListener('click', () => {
        const attrName = item.dataset.attr;
        const attrValue = el.getAttribute(attrName) || "";
        if (uiElements.inputAttrName) uiElements.inputAttrName.value = attrName;
        if (uiElements.inputAttrValue) uiElements.inputAttrValue.value = attrValue;
      });
    });
  }

    function renderHistory() {
    if (!uiElements.historyList) return;

    if (state.patches.length === 0) {
      uiElements.historyList.innerHTML = '<div style="padding:12px; text-align:center; color:#9aa0a6;">No changes yet</div>';
        return;
      }

    uiElements.historyList.innerHTML = state.patches
      .slice()
      .reverse()
      .map(
        (p) => `
      <div class="list-item" data-id="${p.id}">
        <div class="item-info">
          <div class="item-type">${p.type}${p.name ? ` (${p.name})` : ""}</div>
          <div class="item-sel">${typeof p.selector === "string" ? p.selector : p.selector?.value || "?"}</div>
          </div>
        <button class="icon-btn danger" data-delete="${p.id}" title="Delete">×</button>
      </div>
    `
      )
      .join("");

    // Wire delete buttons
    uiElements.historyList.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.delete;
        state.patches = state.patches.filter((p) => p.id !== id);
          await savePatchesForScope();
          renderHistory();
        // Re-apply to clear removed effects (simple refresh)
        // Ideally we should revert specific patch, but for now reload might be needed or re-apply all
      applyAllPatches();
    });
    });
  }

  // ============================================================
  // PICKING
  // ============================================================

  function startPicking() {
    state.picking = true;
    updatePickingUI();

    elementPicker.start({
      onPick: (el, multi) => {
        toggleSelectElement(el, multi);
      },
      onHover: (el) => {
        // Optional: could show preview
      },
      onCancel: () => {
        stopPicking();
      },
    });
  }

  function stopPicking() {
    state.picking = false;
    updatePickingUI();
    elementPicker.stop();
  }

  // ============================================================
  // APPLY & SAVE
  // ============================================================

  async function applyToSelection(type, payload) {
    const arr = selectedArray();
    if (arr.length === 0) {
      alert("No element selected!");
      return;
    }

    // Clear selector cache to ensure fresh, unique selectors
    selectorEngine.clearCache();

    const undoData = [];
    let appliedCount = 0;

    for (const el of arr) {
      // Capture for undo BEFORE making changes
      undoData.push(captureBefore(el, type, payload.name));

      // Apply DIRECTLY to element (works with closed Shadow DOM)
      try {
        if (type === "text") {
          el.textContent = payload.value ?? "";
          appliedCount++;
        } else if (type === "html") {
          el.innerHTML = payload.value ?? "";
          appliedCount++;
        } else if (type === "attr") {
          if (!payload.name) continue;
          if (payload.value === null || payload.value === undefined || payload.value === "") {
            el.removeAttribute(payload.name);
          } else {
            el.setAttribute(payload.name, String(payload.value));
          }
          appliedCount++;
        } else if (type === "style_append") {
          const v = String(payload.value ?? "").trim();
          if (v) {
            // Parse CSS properties and apply with !important
            const cssProps = v.split(";").filter(Boolean);
            for (const prop of cssProps) {
              const [name, val] = prop.split(":").map(s => s.trim());
              if (name && val) {
                el.style.setProperty(name, val.replace(/!important/gi, "").trim(), "important");
              }
            }
          }
          appliedCount++;
        } else if (type === "style_replace") {
          // Replace all styles
          el.removeAttribute("style");
          const v = String(payload.value ?? "").trim();
          if (v) {
            const cssProps = v.split(";").filter(Boolean);
            for (const prop of cssProps) {
              const [name, val] = prop.split(":").map(s => s.trim());
              if (name && val) {
                el.style.setProperty(name, val.replace(/!important/gi, "").trim(), "important");
              }
            }
          }
          appliedCount++;
        } else if (type === "hide") {
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("opacity", "0", "important");
          appliedCount++;
        } else if (type === "remove") {
          el.remove();
          appliedCount++;
          continue;
        }

        el.dataset.f12techPatched = "1";
        // console.log(`F12 Tech: Applied ${type} to element:`, el.tagName, payload);
      } catch (e) {
        // console.warn("F12 Tech: Failed to apply to element", el, e);
      }

      // Try to create selector for persistence (may not work with closed Shadow DOM)
      const selectorObj = selectorEngine.getSelector(el);
      if (selectorObj) {
        // console.log("F12 Tech: Created selector for persistence:", selectorObj);
        
        // Store original text/html for validation when re-applying
        const originalText = undoData.find(u => u.selector === selectorObj)?.prev || "";
        
      const patch = {
          id: uid(),
          selector: selectorObj,
        type,
        value: payload.value ?? "",
          name: payload.name,
          originalText: type === "text" ? originalText : undefined,
          createdAt: nowISO(),
        };

        // Upsert in state - use selector + type as key
      const key = patchKey(patch);
        const idx = state.patches.findIndex((p) => patchKey(p) === key);
      if (idx >= 0) {
          patch.id = state.patches[idx].id;
        state.patches[idx] = patch;
      } else {
        state.patches.push(patch);
        }
      } else {
        // console.warn("F12 Tech: Could not create selector for element:", el);
      }
    }

    // Save undo
    if (undoData.length > 0) {
      state.undoStack.push({ type, payload, before: undoData, elements: arr.slice() });
      if (state.undoStack.length > state.maxUndo) {
        state.undoStack.shift();
      }
    }

    await savePatchesForScope();
    renderHistory();
    clearSelection();

    if (appliedCount > 0) {
      // console.log(`F12 Tech: Applied ${type} to ${appliedCount} element(s)`);
      const typeLabels = {
        text: "Text",
        html: "HTML",
        attr: "Attribute",
        style_append: "Style (Append)",
        style_replace: "Style (Replace)",
        hide: "Hide",
        remove: "Remove"
      };
      showNotification(`✓ ${typeLabels[type] || type} applied to ${appliedCount} element(s)`, "success");
    } else {
      showNotification("⚠ Failed to apply changes", "error");
    }
  }

  function captureBefore(el, type, name) {
    const selector = selectorEngine.getSelector(el);
    if (type === "text") return { selector, type, prev: el.textContent };
    if (type === "html") return { selector, type, prev: el.innerHTML };
    if (type === "attr") return { selector, type, name, prev: el.getAttribute(name) };
    if (type === "style_append" || type === "style_replace") {
      return { selector, type, prev: el.getAttribute("style") || "" };
    }
    if (type === "hide") {
      return {
        selector,
        type,
        prevDisplay: el.style.display,
        prevVisibility: el.style.visibility,
      };
    }
    if (type === "remove") {
      return { selector, type, prevHTML: el.outerHTML, parent: el.parentElement };
    }
    return { selector, type, prev: null };
  }

  async function undoLast() {
    const op = state.undoStack.pop();
    if (!op) {
      alert("Nothing to undo!");
      return;
    }

    let undoneCount = 0;

    for (let i = 0; i < op.before.length; i++) {
      const b = op.before[i];
      
      // Try to use stored element reference first (works with closed Shadow DOM)
      let el = op.elements?.[i];
      
      // Verify element is still in document
      if (!el || !document.contains(el)) {
        // Fallback to selector
        el = selectorEngine.findElement(b.selector);
      }
      
      if (!el) continue;

      try {
        if (b.type === "text") {
          el.textContent = b.prev ?? "";
          undoneCount++;
        } else if (b.type === "html") {
          el.innerHTML = b.prev ?? "";
          undoneCount++;
        } else if (b.type === "attr") {
          if (b.prev == null) el.removeAttribute(b.name);
          else el.setAttribute(b.name, b.prev);
          undoneCount++;
        } else if (b.type === "style_append" || b.type === "style_replace") {
          if (!b.prev) el.removeAttribute("style");
          else el.setAttribute("style", b.prev);
          undoneCount++;
        } else if (b.type === "hide") {
          el.style.display = b.prevDisplay || "";
          el.style.visibility = b.prevVisibility || "";
          undoneCount++;
        }
      } catch (e) {
        // console.warn("F12 Tech: Failed to undo", e);
      }

      // Remove from patches
      state.patches = state.patches.filter((p) => {
        const pSel = typeof p.selector === "string" ? p.selector : p.selector?.value;
        const bSel = typeof b.selector === "string" ? b.selector : b.selector?.value;
        return pSel !== bSel || p.type !== b.type;
      });
    }

    await savePatchesForScope();
    renderHistory();
    
    if (undoneCount > 0) {
      // console.log(`F12 Tech: Undone ${undoneCount} change(s)`);
    }
  }

  async function loadPatchesForScope() {
    const key = PATCH_STORE_PREFIX + makeScopeKey(state.scope);
    const got = await storageGet(key);
    const pack = got?.[key];
    state.patches = Array.isArray(pack?.patches) ? pack.patches : [];
  }

  const savePatchesForScope = debounce(async () => {
    const key = PATCH_STORE_PREFIX + makeScopeKey(state.scope);
    await storageSet({
      [key]: {
        savedAt: nowISO(),
        scope: state.scope,
        scopeKey: makeScopeKey(state.scope),
        patches: state.patches,
      },
    });
  }, 300);

  let isApplying = false;
  
  function applyAllPatches() {
    if (isApplying) return 0; // Prevent re-entry
    isApplying = true;
    
    let totalApplied = 0;
    try {
      for (const p of state.patches) {
        totalApplied += applyOnePatch(p);
      }
    } finally {
      isApplying = false;
    }
    return totalApplied;
  }

  // ============================================================
  // MUTATION OBSERVER
  // ============================================================

  let observer = null;

  function startObserver() {
    if (observer) return;
    if (!state.patches.length) return; // No patches, no need to observe

    // Use RAF + debounce for smooth updates
    let rafId = null;
    let lastApply = 0;
    const MIN_INTERVAL = 100; // Min 100ms between applies
    
    const scheduleApply = () => {
      if (rafId) return;
      
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const now = Date.now();
        if (now - lastApply >= MIN_INTERVAL) {
          lastApply = now;
          applyAllPatches();
        } else {
          // Reschedule
          setTimeout(scheduleApply, MIN_INTERVAL - (now - lastApply));
        }
      });
    };

    observer = new MutationObserver((mutations) => {
      // Quick check - skip our own elements
      for (const m of mutations) {
        const target = m.target;
        if (target?.id === ROOT_ID || target?.id === OVERLAY_ID) return;
        if (target?.closest?.(`#${ROOT_ID}, #${OVERLAY_ID}`)) return;
      }
      scheduleApply();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ============================================================
  // ENABLE / DISABLE
  // ============================================================

  async function enableEditor() {
    state.enabled = true;
    mountUI();
    await loadPatchesForScope();
    applyAllPatches();
    startObserver();
    updateSelectionUI();
    renderHistory();

    if (uiElements.scopeSelect) {
      uiElements.scopeSelect.value = state.scope;
    }
  }

  function disableEditor() {
    state.enabled = false;
    stopPicking();
    clearSelection();
    stopObserver();
    unmountUI();
  }

  async function toggleEditor() {
    if (state.enabled) {
      disableEditor();
    } else {
      await enableEditor();
    }
  }

  // ============================================================
  // BOOT - Stable version
  // ============================================================
  
  async function boot() {
    // Load patches from storage
    await loadPatchesForScope();
    
    if (state.patches.length > 0) {
      // Apply immediately
    applyAllPatches();
      
      // Quick retries for dynamic content
      let retries = 0;
      const retryInterval = setInterval(() => {
        retries++;
        applyAllPatches();
        if (retries >= 5) {
          clearInterval(retryInterval);
    startObserver();
        }
      }, 200);
    } else {
      startObserver();
    }
  }
  
  // Listen for toggle message from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "F12TECH_TOGGLE") {
      toggleEditor();
      sendResponse({ success: true });
    }
    return true;
  });

  // Start boot
  boot();
})();


