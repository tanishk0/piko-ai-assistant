// Recursive descent over a fixed arithmetic grammar; never evaluates JavaScript.
export function calculate(expression) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 512) throw new Error('Provide an expression of 1–512 characters.');
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|\*\*|[+\-*/%^()]|\s+|./gi).filter(t => !/^\s+$/.test(t));
  let i = 0;
  const finite = value => { if (!Number.isFinite(value)) throw new Error('Result is not finite.'); return value; };
  const primary = () => {
    if (tokens[i] === '(') { i++; const value = sum(); if (tokens[i++] !== ')') throw new Error('Missing closing parenthesis.'); return value; }
    const token = tokens[i++];
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) throw new Error('Unsupported arithmetic syntax.');
    return finite(Number(token));
  };
  const power = () => { let value = primary(); if (['^', '**'].includes(tokens[i])) { i++; value = finite(value ** unary()); } return value; };
  const unary = () => { if (tokens[i] === '+') { i++; return unary(); } if (tokens[i] === '-') { i++; return -unary(); } return power(); };
  const product = () => { let value = unary(); while (['*', '/', '%'].includes(tokens[i])) { const op = tokens[i++]; const right = unary(); value = finite(op === '*' ? value * right : op === '/' ? value / right : value % right); } return value; };
  const sum = () => { let value = product(); while (['+', '-'].includes(tokens[i])) { const op = tokens[i++]; const right = product(); value = finite(op === '+' ? value + right : value - right); } return value; };
  const result = sum();
  if (i !== tokens.length) throw new Error('Unsupported arithmetic syntax.');
  return finite(result);
}
