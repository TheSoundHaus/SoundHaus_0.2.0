import eslintConfigNext from "eslint-config-next";

// Keep Next defaults, but avoid enabling React Compiler lint rules repo-wide yet.
const config = [
  ...eslintConfigNext,
  {
    rules: {
      "import/no-anonymous-default-export": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
