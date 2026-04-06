"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Header = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
require("./Header.css");
const Header = ({ userName, avatarUrl }) => {
    return ((0, jsx_runtime_1.jsxs)("header", { className: "fx-header", children: [(0, jsx_runtime_1.jsxs)("div", { className: "header-user", children: [(0, jsx_runtime_1.jsx)("img", { src: avatarUrl, alt: userName, className: "user-avatar" }), (0, jsx_runtime_1.jsxs)("div", { className: "header-text", children: [(0, jsx_runtime_1.jsx)("span", { className: "user-name", children: userName }), (0, jsx_runtime_1.jsx)("span", { className: "welcome-back", children: "Welcome back" })] })] }), (0, jsx_runtime_1.jsx)("button", { className: "support-button", children: (0, jsx_runtime_1.jsx)("svg", { fill: "currentColor", viewBox: "0 0 24 24", width: "24", height: "24", children: (0, jsx_runtime_1.jsx)("path", { d: "M12 2C6.477 2 2 6.477 2 12c0 1.891.527 3.655 1.442 5.16L2 22l4.84-1.442C8.345 21.473 10.109 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.63 0-3.15-.465-4.44-1.266l-.32-.196L4.2 19.458l.92-3.04-.216-.352A7.95 7.95 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" }) }) })] }));
};
exports.Header = Header;
//# sourceMappingURL=Header.js.map