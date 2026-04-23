import eslintConfigNext from 'eslint-config-next';

// Next 16’s flat config enables React Compiler rules that flag many idiomatic patterns
// (data fetch in useEffect, rAF loops, form sync from context). Keep Next defaults but
// turn off rules we are not enforcing repo-wide yet.
const config = [
  ...eslintConfigNext,
  {
    rules: {
      'import/no-anonymous-default-export': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
