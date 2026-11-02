import { generateEyeLayers, generateEyePaths, type EyeConfiguration } from "../geometry/eyes";
import type { GeneratedEyeNode } from "../geometry/eyes/layerGenerator";
import { generateMouthPaths, type MouthGeometry } from "../geometry/mouth";
import type { LayerPosition } from "../config/faceLayerLayouts";

const svgNamespace = "http://www.w3.org/2000/svg";
const camelAttributes = new Set(["viewBox", "gradientUnits", "filterUnits", "maskUnits", "preserveAspectRatio", "stdDeviation"]);
const attributeName = (key: string) => camelAttributes.has(key) ? key : key.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
/** Patch the allowlisted generator output. Keep nodes/resources when topology is unchanged. */
function patch(parent: Element, nodes: readonly GeneratedEyeNode[]): void {
    nodes.forEach((node, index) => {
        let element = parent.children[index];
        if (!element || element.localName !== node.tag) {
            const replacement = parent.ownerDocument.createElementNS(svgNamespace, node.tag);
            if (element) parent.replaceChild(replacement, element);
            else parent.appendChild(replacement);
            element = replacement;
        }
        const expected = new Set(Object.keys(node.props).map(key => key === "xlinkHref" ? "xlink:href" : attributeName(key)));
        for (const attr of Array.from(element.attributes)) if (!expected.has(attr.name)) element.removeAttributeNode(attr);
        for (const [key, value] of Object.entries(node.props)) {
            const name = key === "xlinkHref" ? "xlink:href" : attributeName(key);
            if (element.getAttribute(name) === String(value)) continue;
            if (key === "xlinkHref") element.setAttributeNS("http://www.w3.org/1999/xlink", name, String(value));
            else element.setAttribute(name, String(value));
        }
        patch(element, node.children);
    });
    while (parent.children.length > nodes.length) parent.lastElementChild!.remove();
}
export function positionGeometry(element: HTMLElement, p: LayerPosition): void {
    element.style.left = p.x / 800 * 100 + "%";
    element.style.top = p.y / 480 * 100 + "%";
    element.style.width = p.width / 800 * 100 + "%";
    element.style.height = p.height / 480 * 100 + "%";
}
export function updateProductionEye(svg: SVGSVGElement, g: EyeConfiguration, scope: string, idleTemplate?: SVGSVGElement): void {
    svg.setAttribute("width", String(g.width)); svg.setAttribute("height", String(g.height));
    svg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`);
    updateProductionEyeArtwork(svg,g,scope,idleTemplate);
}
export function updateProductionEyeArtwork(svg: SVGElement, g: EyeConfiguration, scope: string, idleTemplate?: SVGElement): void {
    if ("kind" in g) {
        svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
        patch(svg, generateEyeLayers(g, scope).layers);
    } else {
        // A routed morph can cross the exact Idle ellipse scene between two
        // layered branches. Restore its original React-rendered structure only
        // at that topology boundary, then keep its nodes for subsequent frames.
        svg.removeAttribute("xmlns:xlink");
        if (svg.querySelectorAll("ellipse").length !== 2 || svg.querySelectorAll("path").length !== 2) {
            if (!idleTemplate) throw new Error("Missing canonical Idle eye template");
            svg.replaceChildren(...Array.from(idleTemplate.children).map(node => node.cloneNode(true)));
            const all = (node: Element): Element[] => [node, ...Array.from(node.children).flatMap(all)];
            const nodes = all(svg);
            const ids = new Map(nodes.filter(node => node.hasAttribute("id"))
                .map((node, index) => [node.getAttribute("id")!, scope + "-idle-" + index]));
            for (const node of nodes) for (const attr of Array.from(node.attributes)) {
                if (attr.name === "id") node.setAttribute("id", ids.get(attr.value)!);
                else if (attr.value.includes("url(#")) node.setAttribute(attr.name,
                    attr.value.replace(/url\(#([^)]*)\)/g, (_, id: string) => `url(#${ids.get(id) ?? id})`));
            }
        }
        // Ellipse-family intermediates keep the exact Idle body/style; only
        // Thinking-right's independent highlights move.
        const paths = generateEyePaths(g), ellipse = svg.querySelectorAll("ellipse")[1];
        const highlight = svg.querySelectorAll("path")[1], small = g.highlights.ellipse;
        if (!ellipse || !highlight || !small || !paths.highlight) throw new Error("Missing Thinking-right SVG structure");
        ellipse.setAttribute("cx", String(small.center[0])); ellipse.setAttribute("cy", String(small.center[1]));
        svg.querySelectorAll("path")[0].setAttribute("d", paths.outline);
        highlight.setAttribute("d", paths.highlight);
    }
}
export function updateProductionMouth(svg: SVGSVGElement, geometry: MouthGeometry, scope = "production-mouth"): void {
    const paths = generateMouthPaths(geometry);
    svg.setAttribute("width", String(paths.width)); svg.setAttribute("height", String(paths.height));
    svg.setAttribute("viewBox", paths.viewBox);
    const painted = Array.from(svg.children).filter(node => node.localName === "path");
    if (painted.length !== 3 || !paths.tongue) throw new Error("Missing intermediate mouth SVG structure");
    for (const [node, d] of [[painted[0], paths.cavity], [painted[1], paths.tongue], [painted[2], paths.outline]] as const) node.setAttribute("d", d);
    painted[0].setAttribute("stroke-width", String(geometry.cavityStrokeWidth));
    if (geometry.tongueOpacity === undefined) painted[1].removeAttribute("opacity");
    else painted[1].setAttribute("opacity", String(geometry.tongueOpacity));
    painted[2].setAttribute("stroke-width", String(geometry.strokeWidth));
    let clip = svg.querySelectorAll("clipPath path");
    if (geometry.clipTongue) {
        if (clip.length !== 2) {
            const defs = svg.ownerDocument.createElementNS(svgNamespace, "defs");
            const path = svg.ownerDocument.createElementNS(svgNamespace, "clipPath");
            path.setAttribute("id", scope + "-clip"); path.setAttribute("clipPathUnits", "userSpaceOnUse");
            for (let i = 0; i < 2; i++) {
                const child = svg.ownerDocument.createElementNS(svgNamespace, "path");
                child.setAttribute("fill", "white");
                if (i === 1) child.setAttribute("stroke", "white");
                path.appendChild(child);
            }
            defs.appendChild(path); svg.insertBefore(defs, svg.firstElementChild);
            painted[1].setAttribute("clip-path", `url(#${scope}-clip)`);
            clip = svg.querySelectorAll("clipPath path");
        }
        clip[0].setAttribute("d", paths.cavity); clip[1].setAttribute("d", paths.outline);
        clip[1].setAttribute("stroke-width", String(geometry.strokeWidth));
    } else {
        svg.querySelector("defs")?.remove();
        painted[1].removeAttribute("clip-path");
    }
}
