export { createElement as render, State, isState, valueOf, typeOf };

const svgTagNames = ["animate", "animateMotion", "animateTransform", "circle", "clipPath", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "foreignObject", "g", "image", "line", "linearGradient", "marker", "mask", "metadata", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect", "set", "stop", "svg", "switch", "symbol", "text", "textPath", "tspan", "use", "view"];
const mathMlTagNames = ["annotation", "annotation-xml", "maction", "math", "merror", "mfrac", "mi", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mprescripts", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msubsup", "msup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "semantics"];

function createElement(props) {
    let element = withNamespace(valueOf(valueOf(props).tagName));
    setProps(element, valueOf(props));
    if (isState(props)) {
        props.sub(value => {
            const update = createElement(value);
            element.replaceWith(update);
            element = update;
        });
    }
    else if (isState(props.tagName)) {
        props.tagName.sub(value => {
            const update = withNamespace(value);
            setProps(update, props);
            element.replaceWith(update);
            element = update;
        });
    }
    return element;
}

function withNamespace(tagName) {
    if (getNameSpace(tagName)) {
        const element = document.createElementNS(getNameSpace(tagName), tagName);
        element.requiresAttr = true;
        return element;
    }
    return document.createElement(tagName);
}

function getNameSpace(tagName) {
    if (svgTagNames.includes(tagName)) {
        return "http://www.w3.org/2000/svg";
    }
    if (mathMlTagNames.includes(tagName)) {
        return "http://www.w3.org/1998/Math/MathML";
    }
}

function createTextNode(text) {
    let element = document.createTextNode(valueOf(text));
    if (isState(text)) {
        text.sub(value => {
            const update = document.createTextNode(value);
            element.replaceWith(update);
            element = update;
        });
    }
    return element;
}

function createNode(props) {
    return typeOf(props) === "object" ? createElement(props) : createTextNode(props);
}

function createChildrenNodes(children) {
    return children.map(child => createNode(child));
}

function setProps(target, props) {
    for (let k in props) {
        if (k === "tagName") {
            continue;
        }
        else if (k === "children") {
            setChildrenProps(target, props);
        }
        else if (typeOf(props[k]) === "object") {
            setObjectProps(target, props, k);
        }
        else {
            setPrimitiveProp(target, props, k);
        }
    }
}

function setChildrenProps(target, { children }) {
    let nodes = createChildrenNodes(valueOf(children));
    target.append(...nodes);
    if (isState(children)) {
        children.sub(value => {
            nodes.forEach(el => el?.remove());
            nodes = createChildrenNodes(value);
            target.append(...nodes);
        });
    }
}

function setObjectProps(target, props, k) {
    setProps(target[k], valueOf(props[k]));
    if (isState(props[k])) {
        props[k].sub((value, prev) => {
            unsetProps(target[k], prev);
            setProps(target[k], value);
        });
    }
}

function setPrimitiveProp(target, prop, k) {
    setStaticProp(target, k, valueOf(prop[k]));
    if (isState(prop[k])) {
        prop[k].sub(value => setStaticProp(target, k, value));
    }
}

function setStaticProp(target, k, prop) {
    try {
        target.requiresAttr ? target.setAttribute(parseK(k), prop) : target[k] = prop;
    }
    catch (error) {
        console.warn("failed property assignment: " + k, error);
    }
}

function unsetProps(target, props) {
    for (let k in props) {
        if (k === "children" || k === "tagName") {
            continue;
        }
        else if (typeOf(props[k]) === "object") {
            unsetProps(target[k], valueOf(props[k]));
        }
        else {
            unsetStaticProp(target, k);
        }
    }
}

function unsetStaticProp(target, k) {
    try {
        target.requiresAttr ? target.removeAttribute(parseK(k)) : target[k] = null;
    }
    catch (error) {
        console.warn("failed property unassignment: " + k, error);
    }
}

function parseK(k) {
    return k === "className" ? "class" : k;
}

class State {
    #value;
    #subs;
    constructor(value) {
        this.#value = value;
        this.#subs = [];
    }
    static from(value) {
        return new State(value);
    }
    static use(states) {
        const state = new State({});
        for (let k in states) {
            state.value[k] = states[k].value;
            states[k].sub(parent => state.set(
                curr => Object.assign(curr, { [k]: parent })
            ));
        }
        return state;
    }
    static flatten(from) {
        const into = new State();
        flatten(from, f => into.set(f));
        return into;
    }
    get value() {
        return this.#value;
    }
    set value(value) {
        this.#dispatch(value, this.#value);
        this.#value = value;
    }
    set(f) {
        this.value = f(this.#value);
    }
    as(f) {
        let childState = new State(f(this.#value));
        this.sub(v => childState.value = f(v));
        return childState;
    }
    sub(f) {
        this.#subs.push(f);
    }
    #dispatch(curr, prev) {
        this.#subs = this.#subs.filter(f => {
            try {
                f(curr, prev);
                return true;
            }
            catch {
                return false;
            }
        });
    }
    toJSON() {
        return JSON.stringify(this.value);
    }
}

function flatten(from, set) {
    const object = valueOf(from);
    const setKey = initObj(set, object);
    for (let k in object) {
        if (typeOf(object[k]) === "object") {
            flatten(object[k], f => setKey(set, k, f, true));
        }
        else {
            setKey(set, k, valueOf(object[k]));
            if (isState(object[k])) {
                object[k].sub(v => setKey(set, k, v));
            }
        }
    }
    if (isState(from)) {
        from.sub(from => {
            set(() => undefined);
            flatten(from, set);
        });
    }
}

function initObj(set, from) {
    const isArray = Array.isArray(from);
    set(c => c ?? (isArray ? new Array(from.length) : undefined));
    return isArray ? setArr : setObj;
}

function setObj(set, key, value, isFn) {
    set(c => Object.assign(c ?? {}, {
        [key]: isFn ? value(c?.[key]) : value
    }));
}

function setArr(set, key, value, isFn) {
    set(c => {
        c[key] = isFn ? value(c?.[key]) : value;
        return c;
    });
}

function isState(v) {
    return v instanceof State;
}

function valueOf(v) {
    return isState(v) ? v.value : v;
}

function typeOf(v) {
    return typeof valueOf(v);
}
