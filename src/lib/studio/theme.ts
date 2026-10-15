import { studioTheme } from "ag-studio";
export const cockpitTheme = studioTheme
  .withParams(
    {
      fontFamily: "inherit",
      borderRadius: 8,
      accentColor: "#00614d",
      studioWidgetBorderRadius: 12,
      studioWidgetPadding: 12,
      studioCanvasBackgroundColor: "#f5f8f7",
      gridRowHeight: 36,
      chartTextColor: "#172338",
    },
    "light",
  )
  .withParams(
    {
      accentColor: "#52d4b2",
      studioCanvasBackgroundColor: "#111d26",
      chartTextColor: "#e5f1ef",
    },
    "dark",
  );
