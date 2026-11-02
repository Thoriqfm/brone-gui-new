// A bounded SVG DOM fixture for the imperative adapter; this is not a browser.
// Parse actual React SSR output so adapter assertions cover real renderer structure.
export class Element {
    constructor(tag, props = {}) {
        this.localName = tag; this.props = { ...props }; this.children = [];
        this.parent = null; this.style = {}; this.isConnected = true;
        this.ownerDocument = { createElementNS: (_ns, name) => new Element(name) };
    }
    get attributes() { return Object.entries(this.props).map(([name, value]) => ({ name, value })); }
    get lastElementChild() { return this.children.at(-1); }
    get firstElementChild() { return this.children[0] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.props, name); }
    cloneNode(deep) { const node = new Element(this.localName, this.props); if (deep) this.children.forEach(child => node.appendChild(child.cloneNode(true))); return node; }
    replaceChildren(...nodes) { this.children.forEach(child => child.parent = null); this.children = []; nodes.forEach(node => this.appendChild(node)); }
    insertBefore(node, reference) { node.parent = this; const index = this.children.indexOf(reference); this.children.splice(index < 0 ? this.children.length : index, 0, node); return node; }
    getAttribute(name) { return this.props[name] ?? null; }
    setAttribute(name, value) { this.props[name] = String(value); }
    setAttributeNS(_ns, name, value) { this.setAttribute(name, value); }
    removeAttributeNode(attr) { delete this.props[attr.name]; }
    removeAttribute(name) { delete this.props[name]; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    replaceChild(child, old) { child.parent = this; this.children[this.children.indexOf(old)] = child; old.parent = null; }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    querySelectorAll(selector) {
        const parts = selector.split(" "), matches = [];
        const matchesPart=(node,part)=>{
            const attr=part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
            return attr?node.hasAttribute(attr[1]) && (attr[2]===undefined || node.getAttribute(attr[1])===attr[2]):node.localName===part;
        };
        const visit = (node, ancestors) => {
            const last = parts.at(-1);
            if (matchesPart(node,last) && (parts.length === 1 || ancestors.some(a => matchesPart(a,parts[0])))) matches.push(node);
            for (const child of node.children) visit(child, [...ancestors, node]);
        };
        for (const child of this.children) visit(child, []);
        return matches;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
export function parse(markup) {
    const root = new Element("document"), stack = [root];
    for (const match of markup.matchAll(/<(\/?)([\w:-]+)\b([^>]*)>/g)) {
        const [, closing, tag, tail] = match;
        if (closing) { stack.pop(); continue; }
        const props = Object.fromEntries([...tail.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const node = new Element(tag, props); stack.at(-1).appendChild(node);
        if (!tail.endsWith("/") && !["img", "link", "input", "meta", "br"].includes(tag)) stack.push(node);
    }
    return root;
}
export const serialize = node => `<${node.localName}${Object.entries(node.props).map(([k,v]) => ` ${k}="${v}"`).join("")}>${node.children.map(serialize).join("")}</${node.localName}>`;
export function normalize(node) {
    const all = [];
    const visit = n => { all.push(n); n.children.forEach(visit); }; visit(node);
    const ids = new Map(all.filter(n => n.props.id).map((n,i) => [n.props.id, "id" + i]));
    const value = (k,v) => k === "id" ? ids.get(v) : v.replace(/url\(#([^)]*)\)/g, (_,id) => `url(#${ids.get(id)})`).replace(/^#(.+)$/, (_,id) => ids.has(id) ? "#" + ids.get(id) : "#" + id);
    const walk = n => ({ tag:n.localName, props:Object.fromEntries(Object.entries(n.props).map(([k,v]) => [k,value(k,v)])), children:n.children.map(walk) });
    return walk(node);
}
