import type { EyeCommand, EyeReference, EyeSvgNode, LayeredEyeGeometry } from "./types";

const paint = "id fill stroke strokeWidth opacity fillOpacity filter mask transform";
// Required properties precede '|'; optional ones follow it. Unknown properties fail closed.
const attributes = {
    g: "|" + paint, path: "|" + paint,
    ellipse: "cx cy rx ry|" + paint, rect: "x y width height|" + paint,
    use: "xlinkHref|" + paint, mask: "id|maskUnits x y width height " + paint,
    defs: "|", linearGradient: "id x1 y1 x2 y2 gradientUnits|", stop: "offset stopColor|",
    filter: "id x y width height filterUnits colorInterpolationFilters|",
    feFlood: "floodOpacity result|", feBlend: "mode in2 result|in",
    feColorMatrix: "type values|in result", feOffset: "dy|",
    feGaussianBlur: "stdDeviation|result", feComposite: "in2 operator k2 k3|",
} as const;
const numeric = new Set("cx cy rx ry x y width height x1 y1 x2 y2 strokeWidth opacity fillOpacity offset floodOpacity dy stdDeviation k2 k3".split(" "));
const positive = new Set(["rx", "ry", "width", "height", "strokeWidth"]);
const opacity = new Set(["opacity", "fillOpacity", "offset", "floodOpacity"]);
const enums: Record<string, string> = { maskUnits: "userSpaceOnUse", gradientUnits: "userSpaceOnUse",
    filterUnits: "userSpaceOnUse", colorInterpolationFilters: "sRGB", mode: "normal", type: "matrix", operator: "arithmetic" };
const primitiveTags = Object.keys(attributes).filter((tag) => tag.startsWith("fe"));
const paintTags = ["g", "path", "ellipse", "rect", "use", "mask", "defs"];
const allowedChildren: Record<string, readonly string[]> = {
    root: paintTags, g: paintTags, mask: ["g", "path", "ellipse", "rect", "use"],
    defs: ["filter", "linearGradient", "path", "mask"], filter: primitiveTags, linearGradient: ["stop"],
};
function check(value: unknown, label: string): asserts value {
    if (!value) throw new RangeError("Invalid layered eye: " + label);
}
function finite(value: unknown): asserts value is number {
    check(typeof value === "number" && Number.isFinite(value), "finite number");
}
function identifier(value: unknown): asserts value is string {
    check(typeof value === "string" && /^[A-Za-z][\w-]*$/.test(value), "identifier");
}
function list(value: unknown, length?: number): asserts value is readonly unknown[] {
    check(Array.isArray(value) && (length === undefined || value.length === length), "array shape");
    for (let i = 0; i < value.length; i++) check(i in value, "sparse array");
}
function reference(value: unknown): asserts value is EyeReference {
    check(value && typeof value === "object" && Object.keys(value).length === 1 && "ref" in value, "reference");
    identifier(value.ref);
}
export function generateEyePath(commands: readonly EyeCommand[]): string {
    list(commands); check(commands.length >= 3, "path length");
    check(commands[0]?.[0] === "M" && commands[commands.length - 1]?.[0] === "Z", "closed M...Z path");
    return commands.map((command, i) => {
        list(command); const tag = command[0];
        check(tag === "M" || tag === "L" || tag === "C" || tag === "Z", "path command");
        check((tag !== "M" || i === 0) && (tag !== "Z" || i === commands.length - 1), "command order");
        check(command.length === (tag === "Z" ? 1 : tag === "C" ? 7 : 3), "command arity");
        for (let k = 1; k < command.length; k++) finite(command[k]);
        return tag + command.slice(1).join(" ");
    }).join("");
}

/** Validates data, SVG ownership and local references; never accepts raw markup. */
export function validateLayeredEye(g: LayeredEyeGeometry): void {
    check(g && typeof g === "object" && g.kind === "layered", "configuration");
    check(g.side === "left" || g.side === "right", "side");
    finite(g.width); finite(g.height); check(g.width > 0 && g.height > 0, "viewport");
    list(g.layers); check(g.layers.length > 0, "layers");
    const ids = new Map<string, EyeSvgNode>();
    const refs: { target: string; type: string; owners: readonly string[] }[] = [];
    const seen = new Set<EyeSvgNode>();
    function walk(node: EyeSvgNode, parent: string, owners: readonly string[], depth: number) {
        check(node && typeof node === "object" && !seen.has(node) && depth < 32, "cyclic or too-deep node tree");
        seen.add(node);
        check(Object.hasOwn(attributes, node.tag), "element tag");
        check((allowedChildren[parent] ?? []).includes(node.tag), "element placement");
        check(Object.keys(node).every((key) => ["tag", "attributes", "children", "commands"].includes(key)), "node property");
        const a = node.attributes;
        check(a && typeof a === "object" && !Array.isArray(a), "attributes");
        const [required, optional] = attributes[node.tag].split("|").map((s) => s.split(" ").filter(Boolean));
        for (const key of required) check(Object.hasOwn(a, key), "missing " + key);
        const id = "id" in a ? a.id : undefined;
        if (id !== undefined) {
            identifier(id); check(!ids.has(id), "duplicate id"); ids.set(id, node); owners = [...owners, id];
        }
        for (const [key, value] of Object.entries(a)) {
            check(required.includes(key) || optional.includes(key), "attribute " + key);
            if (numeric.has(key)) {
                finite(value);
                if (positive.has(key)) check(value > 0, "positive " + key);
                if (opacity.has(key)) check(value >= 0 && value <= 1, "unit " + key);
                if (key === "stdDeviation") check(value >= 0, "blur");
            } else if (key in enums) check(value === enums[key], key);
            else if (["filter", "mask", "xlinkHref"].includes(key) ||
                (["fill", "stroke", "stopColor"].includes(key) && typeof value === "object")) {
                reference(value);
                check(key !== "stopColor", "gradient stop must be a color");
                refs.push({ target: value.ref, type: key === "fill" || key === "stroke" ? "linearGradient" : key === "xlinkHref" ? "path" : key, owners });
            } else if (["fill", "stroke", "stopColor"].includes(key)) {
                check(typeof value === "string" && /^(?:none|black|white|#[a-fA-F\d]{6})$/.test(value), "color");
            } else if (key === "values") {
                list(value, 20); value.forEach(finite);
            } else if (key === "transform") {
                check(value && typeof value === "object" && "kind" in value && "values" in value, "transform");
                check(Object.keys(value).length === 2 && (value.kind === "matrix" || value.kind === "rotate"), "transform kind");
                list(value.values, value.kind === "matrix" ? 6 : 3); value.values.forEach(finite);
            } else identifier(value);
        }
        if (node.tag === "path") generateEyePath(node.commands);
        else check(node.commands === undefined, "commands belong to paths");
        list(node.children);
        for (const child of node.children) walk(child, node.tag, owners, depth + 1);
        if (node.tag === "linearGradient") {
            const stops = node.children;
            check(stops.length >= 2, "gradient stops");
            let previous = -1;
            for (const stop of stops) {
                check(stop.tag === "stop", "gradient child");
                finite(stop.attributes.offset); check(stop.attributes.offset >= previous, "gradient stop order");
                previous = stop.attributes.offset;
            }
            const a = node.attributes;
            check(a.x1 !== a.x2 || a.y1 !== a.y2, "gradient direction");
        }
        if (node.tag === "filter") {
            const results = new Set(["SourceGraphic", "SourceAlpha"]);
            check(node.children.length > 0, "empty filter");
            for (const child of node.children) {
                for (const [key, value] of Object.entries(child.attributes))
                    if (key === "in" || key === "in2") check(results.has(value as string), "filter input");
                if ("result" in child.attributes && child.attributes.result) results.add(child.attributes.result);
            }
        }
        seen.delete(node);
    }
    for (const node of g.layers) walk(node, "root", [], 0);
    const graph = new Map<string, string[]>();
    for (const { target, type, owners } of refs) {
        check(ids.get(target)?.tag === type, "missing or wrong-type reference " + target);
        for (const owner of owners) graph.set(owner, [...(graph.get(owner) ?? []), target]);
    }
    function visit(id: string, active: Set<string>) {
        check(!active.has(id), "reference cycle");
        const next = new Set(active).add(id);
        for (const target of graph.get(id) ?? []) visit(target, next);
    }
    for (const id of ids.keys()) visit(id, new Set());
}

export interface GeneratedEyeNode {
    readonly tag: EyeSvgNode["tag"];
    readonly props: Readonly<Record<string, string | number>>;
    readonly children: readonly GeneratedEyeNode[];
}
/** Pure conversion to allowlisted React/SVG properties; reference scope comes from useId. */
export function generateEyeLayers(g: LayeredEyeGeometry, scope: string) {
    validateLayeredEye(g);
    check(typeof scope === "string" && /^[\w:-]+$/.test(scope), "reference scope");
    function generate(node: EyeSvgNode): GeneratedEyeNode {
        const props: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(node.attributes)) {
            if (key === "id") props[key] = scope + "-" + value;
            else if (typeof value === "object" && "ref" in value) {
                props[key] = key === "xlinkHref" ? "#" + scope + "-" + value.ref : `url(#${scope}-${value.ref})`;
            } else if (key === "values" && Array.isArray(value)) props[key] = value.join(" ");
            else if (typeof value === "object" && "kind" in value) props[key] = value.kind + "(" + value.values.join(" ") + ")";
            else props[key] = value as string | number;
        }
        if (node.tag === "path") props.d = generateEyePath(node.commands);
        return { tag: node.tag, props, children: node.children.map(generate) };
    }
    return { viewBox: `0 0 ${g.width} ${g.height}`, layers: g.layers.map(generate) };
}
