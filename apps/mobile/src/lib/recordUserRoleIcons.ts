import {
  Clock3,
  Crown,
  ListOrdered,
  Mail,
  Presentation,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react-native";

export const recordUserRoleIcons = {
  admin: Crown,
  moderator: ShieldCheck,
  demonstrator: Presentation,
  invitation: Mail,
  request: Clock3,
  waiting: ListOrdered,
  accepted: UserRoundCheck,
};
