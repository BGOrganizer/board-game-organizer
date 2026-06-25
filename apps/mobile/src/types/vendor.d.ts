
declare module "@clerk/expo/web" {
  export function UserButton(): JSX.Element;
}

declare module "heroui-native" {
  import type React from "react";
  import type { ViewProps, TextProps } from "react-native";

  export class HeroUINativeProvider extends React.Component<{
    children: React.ReactNode;
  }> {}
}

declare module "heroui-native/button" {
  import type React from "react";

  export interface ButtonProps {
    children?: React.ReactNode;
    onPress?: () => void;
    color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
    className?: string;
  }

  export const Button: React.FC<ButtonProps>;
}

declare module "heroui-native/card" {
  import type React from "react";

  export interface CardProps {
    children?: React.ReactNode;
    className?: string;
  }

  export const Card: React.FC<CardProps>;
}