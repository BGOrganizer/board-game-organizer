import type { XmlAST } from "react-native-svg";
import { type ArtworkMotion, resourceArtworkMotion } from "./resourceArtworkMotion";

export type ArtworkPlacement = { x: number; y: number; scale: number };
export type ArtworkLayer = {
  key: string;
  ast: XmlAST;
  motion?: ArtworkMotion;
  placement: ArtworkPlacement;
};
type Segment = { nodes: XmlAST[]; motion?: ArtworkMotion; placement: ArtworkPlacement };
const identity: ArtworkPlacement = { x: 0, y: 0, scale: 1 };

function hasMotion(node: XmlAST, celebration?: string): boolean {
  return (
    !!resourceArtworkMotion(String(node.props.class ?? ""), celebration) ||
    node.children.some((child) => typeof child !== "string" && hasMotion(child, celebration))
  );
}

function placement(parent: ArtworkPlacement, transform: string | undefined): ArtworkPlacement {
  if (!transform) return parent;
  // Approved v9 animation ancestors use translation and optional uniform scaling only.
  const match = /^translate\(([-\d.]+) ([-\d.]+)\)(?: scale\(([-\d.]+)\))?$/.exec(transform);
  if (!match) throw new Error("Unsupported resource artwork animation ancestor transform");
  return {
    x: parent.x + parent.scale * Number(match[1]),
    y: parent.y + parent.scale * Number(match[2]),
    scale: parent.scale * Number(match[3] ?? 1),
  };
}

function append(segments: Segment[], next: Segment) {
  const previous = segments.at(-1);
  if (previous && !previous.motion && !next.motion) previous.nodes.push(...next.nodes);
  else segments.push(next);
}

function split(node: XmlAST, parent: ArtworkPlacement, celebration?: string): Segment[] {
  const motion = resourceArtworkMotion(String(node.props.class ?? ""), celebration);
  if (motion) return [{ nodes: [node], motion, placement: parent }];
  if (!hasMotion(node, celebration)) return [{ nodes: [node], placement: identity }];
  // Splitting a shared alpha, mask or clip would change compositing. None exist in v9 ancestors.
  if (node.tag !== "g" || Object.keys(node.props).some((key) => !["id", "transform"].includes(key)))
    throw new Error("Unsupported resource artwork animation ancestor composition");
  const positioned = placement(parent, node.props.transform as string | undefined);
  const segments: Segment[] = [];
  for (const child of node.children) {
    if (typeof child === "string") continue;
    for (const segment of split(child, positioned, celebration))
      append(segments, {
        ...segment,
        nodes: [{ ...node, parent: null, children: segment.nodes }],
      });
  }
  return segments;
}

function assertGeometry(node: XmlAST) {
  if (
    Object.values(node.props).some((value) => String(value).includes("url(")) ||
    "href" in node.props ||
    "xlinkHref" in node.props
  )
    throw new Error("Unsupported resource artwork internal definition reference");
  for (const child of node.children) if (typeof child !== "string") assertGeometry(child);
}

/** Preserve the approved draw order while keeping every SVG plane immutable during motion. */
export function resourceArtworkLayers(root: XmlAST, celebration?: string): ArtworkLayer[] {
  const nodes = root.children.filter((child): child is XmlAST => typeof child !== "string");
  const definitions = nodes.find((node) => node.tag === "defs");
  const scene = nodes.find((node) => node.tag === "g");
  if (!definitions || !scene) throw new Error("Missing resource artwork scene");
  const byId = new Map(
    definitions.children
      .filter((child): child is XmlAST => typeof child !== "string")
      .map((child) => [child.props.id, child]),
  );
  const clip = byId.get(String(scene.props.clipPath).slice(5, -1));
  if (!clip) throw new Error("Unsupported resource artwork viewport clip");
  const rectangle = clip.children[0];
  if (
    root.props.viewBox !== "0 0 240 240" ||
    Object.keys(scene.props).length !== 1 ||
    scene.props.clipPath !== `url(#${clip.props.id})` ||
    clip.tag !== "clipPath" ||
    !rectangle ||
    typeof rectangle === "string" ||
    clip.children.length !== 1 ||
    rectangle.tag !== "rect" ||
    Object.keys(rectangle.props).some((key) => !["width", "height", "rx", "ry"].includes(key)) ||
    Number(rectangle.props.width) !== 240 ||
    Number(rectangle.props.height) !== 240 ||
    Number(rectangle.props.rx) !== 0 ||
    Number(rectangle.props.ry) !== 0
  )
    throw new Error("Unsupported resource artwork viewport clip");
  const segments: Segment[] = [];
  for (const child of scene.children) {
    if (typeof child === "string") continue;
    const component = byId.get(String(child.props.href).slice(1));
    if (child.tag !== "use" || Object.keys(child.props).length !== 1 || !component)
      throw new Error("Unsupported resource artwork component reference");
    // CSS runs only on web; its empty definition contributes no native drawing.
    if (component.children.some((node) => typeof node !== "string" && node.tag === "style"))
      continue;
    assertGeometry(component);
    for (const segment of split(component, identity, celebration)) append(segments, segment);
  }
  // The renderer owns v9's fixed 240×240 outer clip, so it stays fixed as planes move.
  return segments.map(({ nodes: children, motion, placement }, index) => ({
    key: `${children[0].props.id}:${index}`,
    ast: { ...root, parent: null, children },
    motion,
    placement,
  }));
}

/** Conjugate the existing SVG motion through its static ancestors and the display scale. */
export function artworkLayerTransform(
  matrix: readonly number[],
  parent: ArtworkPlacement,
  displayScale: number,
) {
  "worklet";
  const [a, b, c, d, tx, ty] = matrix;
  const x = parent.x * displayScale;
  const y = parent.y * displayScale;
  const scale = parent.scale * displayScale;
  return [
    a,
    b,
    0,
    0,
    c,
    d,
    0,
    0,
    0,
    0,
    1,
    0,
    x + scale * tx - a * x - c * y,
    y + scale * ty - b * x - d * y,
    0,
    1,
  ];
}
