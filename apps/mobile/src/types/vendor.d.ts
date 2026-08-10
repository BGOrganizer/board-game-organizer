declare module "*.css";

declare module "@clerk/expo/web" {
  export function UserButton(): JSX.Element;
}

// Minimal shim for the heroui-native root provider (subpath components like
// heroui-native/button, heroui-native/card, heroui-native/text, etc. resolve
// their real types directly from the package).
declare module "heroui-native" {
  import type React from "react";

  export class HeroUINativeProvider extends React.Component<{
    children: React.ReactNode;
  }> {}
}
