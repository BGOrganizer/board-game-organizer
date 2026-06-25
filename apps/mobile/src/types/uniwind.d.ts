// Type augmentation for Uniwind className support on RN components
import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
}

declare module "react-native-gesture-handler" {
  interface GestureHandlerRootViewProps {
    className?: string;
  }
}