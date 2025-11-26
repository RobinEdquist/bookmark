import en from "./messages/en/common.json";
import enAuth from "./messages/en/auth.json";
import enSettings from "./messages/en/settings.json";
import enLibrary from "./messages/en/library.json";

type Messages = typeof en &
  typeof enAuth &
  typeof enSettings &
  typeof enLibrary;

declare global {
  interface IntlMessages extends Messages {}
}
