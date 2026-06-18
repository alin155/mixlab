import { theme, type ThemeConfig } from "antd";

export const antdLabTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#2563eb",
    colorInfo: "#2563eb",
    colorSuccess: "#059669",
    colorWarning: "#d97706",
    colorError: "#dc2626",
    borderRadius: 14,
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 14,
    wireframe: false
  },
  components: {
    Card: {
      headerFontSize: 16,
      paddingLG: 22
    },
    Table: {
      headerBg: "#f8fafc",
      rowHoverBg: "#eff6ff"
    },
    Segmented: {
      itemSelectedBg: "#ffffff"
    }
  }
};
