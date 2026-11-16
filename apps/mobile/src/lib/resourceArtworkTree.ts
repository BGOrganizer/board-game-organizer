import type { XmlAST } from "react-native-svg";
import { resourceArtworkMotion } from "./resourceArtworkMotion";

/** Swap native group components without copying or rebuilding any approved SVG geometry. */
export function resourceArtworkTree(
  node: XmlAST,
  animatedGroup: XmlAST["Tag"],
  celebration?: string,
): XmlAST {
  if (
    node.tag === "g" &&
    typeof node.props.class === "string" &&
    resourceArtworkMotion(node.props.class, celebration)
  )
    node.Tag = animatedGroup;
  for (const child of node.children)
    if (typeof child !== "string") resourceArtworkTree(child, animatedGroup, celebration);
  return node;
}
