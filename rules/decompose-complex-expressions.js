'use strict';

// Four analysis modes, not a single AST-node count:
// 1. Simple expression — lookups and literals (user.profile.name)
// 2. Composition — fluent/pipeline method chains (.pipe(), .map().filter(), builders)
// 3. Nested computation — free calls wrapping other calls (foo(bar(baz(x))))
// 4. Independent computation — sibling non-trivial arguments (createReport(a(), b(), c()))

const DEFAULT_THRESHOLD = 5;

const WRAPPER_TYPES = new Set([
  'ChainExpression',
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSInstantiationExpression',
  'ParenthesizedExpression'
]);

const NONE = Object.freeze({
  score: 0,
  independent: 0,
  nestedDepth: 0,
  nested: false,
  branching: false,
  independentComputations: false
});

function result(partial) {
  return {
    score: 0,
    independent: 0,
    nestedDepth: 0,
    nested: false,
    branching: false,
    independentComputations: false,
    ...partial
  };
}

function unwrap(node) {
  while (node && WRAPPER_TYPES.has(node.type) && node.expression && node.expression !== node)
    node = node.expression;

  return node;
}

function isFunctionNode(node) {
  const current = unwrap(node);

  return Boolean(
    current &&
    (current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'ClassExpression' ||
      current.type === 'ClassDeclaration')
  );
}

function isTrivial(node) {
  const current = unwrap(node);

  if (!current)
    return true;

  switch (current.type) {
    case 'Identifier':
    case 'PrivateIdentifier':
    case 'Literal':
    case 'ThisExpression':
    case 'Super':
    case 'MetaProperty':
      return true;
    case 'TemplateLiteral':
      return current.expressions.every(isTrivial);
    case 'MemberExpression':
      if (!isTrivial(current.object))
        return false;

      return current.computed ? isTrivial(current.property) : true;
    default:
      return false;
  }
}

function isCallNode(node) {
  const current = unwrap(node);

  return Boolean(
    current &&
    (current.type === 'CallExpression' || current.type === 'NewExpression')
  );
}

function calleeOf(node) {
  return unwrap(node.callee);
}

function isMethodCallee(callee) {
  return Boolean(callee && callee.type === 'MemberExpression');
}

function isFluentChain(node) {
  const current = unwrap(node);

  return Boolean(current && current.type === 'CallExpression' && isMethodCallee(calleeOf(current)));
}

function unwrapUnary(node) {
  let current = unwrap(node);

  while (current && (current.type === 'UnaryExpression' || current.type === 'UpdateExpression'))
    current = unwrap(current.argument);

  return current;
}

function isCallLikeTerm(node) {
  return isCallNode(unwrapUnary(node));
}

function collectChain(node) {
  const links = [];
  let current = unwrap(node);

  while (current && current.type === 'CallExpression') {
    const callee = calleeOf(current);

    if (!isMethodCallee(callee))
      break;

    links.push(current);
    current = unwrap(callee.object);
  }

  return { links, root: current };
}

function argumentNodes(node) {
  const args = node.arguments ?? [];
  const out = [];

  for (const arg of args) {
    if (!arg)
      continue;

    out.push(arg.type === 'SpreadElement' ? arg.argument : arg);
  }

  return out;
}

function mergeFlags(target, extra) {
  target.nested = target.nested || extra.nested;
  target.branching = target.branching || extra.branching;
  target.independentComputations =
    target.independentComputations || extra.independentComputations;
  target.nestedDepth = Math.max(target.nestedDepth, extra.nestedDepth);
}

function analyzeCallback(analyze, node) {
  const fn = unwrap(node);

  if (!fn || fn.body.type === 'BlockStatement')
    return NONE;

  return analyze(fn.body);
}

function createAnalyzer() {
  const cache = new WeakMap();

  function analyze(node) {
    const current = unwrap(node);

    if (!current)
      return NONE;

    const cached = cache.get(current);

    if (cached)
      return cached;

    const computed = analyzeNode(current);
    cache.set(current, computed);

    return computed;
  }

  function analyzeNode(node) {
    switch (node.type) {
      case 'Identifier':
      case 'PrivateIdentifier':
      case 'Literal':
      case 'ThisExpression':
      case 'Super':
      case 'MetaProperty':
        return NONE;
      case 'TemplateLiteral':
        return analyzeTemplate(node);
      case 'MemberExpression':
        return analyzeMember(node);
      case 'CallExpression':
        return analyzeCall(node);
      case 'NewExpression':
        return analyzeComputation(node, 1);
      case 'ImportExpression':
        return analyzeImport(node);
      case 'AwaitExpression':
        return analyze(node.argument);
      case 'UnaryExpression':
      case 'UpdateExpression':
      case 'YieldExpression':
        return analyze(node.argument);
      case 'LogicalExpression':
        return analyzeLogical(node);
      case 'BinaryExpression':
        return analyzeBinary(node);
      case 'ConditionalExpression':
        return analyzeConditional(node);
      case 'ObjectExpression':
      case 'ArrayExpression':
        return NONE;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return analyzeCallback(analyze, node);
      case 'AssignmentExpression':
      case 'AssignmentPattern':
        return analyze(node.right);
      case 'SequenceExpression':
        return analyzeSequence(node);
      case 'TaggedTemplateExpression':
        return analyzeTaggedTemplate(node);
      case 'SpreadElement':
        return analyze(node.argument);
      case 'ChainExpression':
        return analyze(node.expression);
      default:
        return NONE;
    }
  }

  function analyzeMember(node) {
    const object = analyze(node.object);
    const property = node.computed ? analyze(node.property) : NONE;

    return result({
      score: object.score + property.score,
      nestedDepth: Math.max(object.nestedDepth, property.nestedDepth),
      nested: object.nested || property.nested,
      branching: object.branching || property.branching,
      independentComputations: object.independentComputations || property.independentComputations
    });
  }

  function analyzeTemplate(node) {
    const out = result({});

    for (const expression of node.expressions) {
      const piece = analyze(expression);
      out.score += piece.score;
      mergeFlags(out, piece);
    }

    return out;
  }

  function analyzeTaggedTemplate(node) {
    const tag = analyze(node.tag);
    const quasi = analyzeTemplate(node.quasi);

    return result({
      score: 1 + tag.score + quasi.score,
      nestedDepth: Math.max(1, tag.nestedDepth, quasi.nestedDepth),
      nested: tag.nested || quasi.nested,
      branching: tag.branching || quasi.branching,
      independentComputations: tag.independentComputations || quasi.independentComputations
    });
  }

  function analyzeImport(node) {
    const source = analyze(node.source);

    return result({
      score: 1 + source.score,
      nestedDepth: 1 + source.nestedDepth,
      nested: source.nested || source.nestedDepth >= 1,
      branching: source.branching,
      independentComputations: source.independentComputations
    });
  }

  function analyzeSequence(node) {
    const out = result({});

    for (const expression of node.expressions) {
      const piece = analyze(expression);
      out.score = Math.max(out.score, piece.score);
      mergeFlags(out, piece);
    }

    return out;
  }

  function analyzeCall(node) {
    if (isFluentChain(node))
      return analyzeComposition(node);

    return analyzeComputation(node, 1);
  }

  function analyzeComposition(node) {
    const { links, root } = collectChain(node);
    const out = result({
      score: 1,
      nestedDepth: 1
    });

    if (root && !isTrivial(root)) {
      const rootAnalysis = analyze(root);
      out.score += rootAnalysis.score;
      mergeFlags(out, rootAnalysis);
      out.nestedDepth = Math.max(out.nestedDepth, 1 + rootAnalysis.nestedDepth);
    }

    for (const link of links) {
      for (const arg of argumentNodes(link)) {
        const piece = analyzePipelineArg(arg);
        out.score += piece.score;
        mergeFlags(out, piece);
        out.nestedDepth = Math.max(out.nestedDepth, piece.nestedDepth);
      }
    }

    return out;
  }

  function analyzePipelineArg(arg) {
    if (isTrivial(arg) || isFunctionNode(arg))
      return NONE;

    const current = unwrap(arg);

    if (current && current.type === 'CallExpression' && !isMethodCallee(calleeOf(current))) {
      const out = result({});

      for (const inner of argumentNodes(current)) {
        if (isFunctionNode(inner))
          continue;

        const piece = analyze(inner);
        out.score += piece.score;
        mergeFlags(out, piece);
      }

      return out;
    }

    return analyze(arg);
  }

  function analyzeComputation(node, selfDepth) {
    const out = result({
      score: 1,
      nestedDepth: selfDepth
    });

    const callee = calleeOf(node);

    if (callee && callee.type !== 'Identifier' && !isTrivial(callee) && !isMethodCallee(callee)) {
      const calleeAnalysis = analyze(callee);
      out.score += calleeAnalysis.score;
      mergeFlags(out, calleeAnalysis);
    }

    let nonTrivialArgs = 0;
    let nestedArgDepth = 0;
    let nestedArg = false;

    for (const arg of argumentNodes(node)) {
      if (isFunctionNode(arg))
        continue;

      if (isTrivial(arg))
        continue;

      nonTrivialArgs += 1;
      const piece = analyze(arg);
      out.score += piece.score;
      mergeFlags(out, piece);
      nestedArgDepth = Math.max(nestedArgDepth, piece.nestedDepth);
      nestedArg = nestedArg || piece.nestedDepth >= 1 || isCallNode(arg);
    }

    if (nonTrivialArgs === 1 && nestedArg) {
      out.score += 1;
      out.nested = true;
    }

    if (nonTrivialArgs >= 2) {
      out.score += nonTrivialArgs - 1;
      out.independent = nonTrivialArgs;
      out.independentComputations = true;
    }

    out.nestedDepth = Math.max(out.nestedDepth, selfDepth + nestedArgDepth);

    return out;
  }

  function analyzeLogical(node) {
    const terms = [];
    flattenLogical(node, node.operator, terms);

    const computational = [];
    const out = result({});

    for (const term of terms) {
      const piece = analyze(term);
      mergeFlags(out, piece);

      if (piece.score > 0 || isCallLikeTerm(term))
        computational.push(piece);
    }

    if (computational.length < 2)
      return result({
        nestedDepth: out.nestedDepth,
        nested: out.nested,
        branching: out.branching,
        independentComputations: out.independentComputations
      });

    for (const piece of computational)
      out.score += piece.score;

    out.independent = computational.length;
    out.independentComputations = true;

    const mixed = terms.length > computational.length;

    if (mixed && terms.length >= 4)
      out.score += (computational.length - 1) + (terms.length - computational.length);

    return out;
  }

  function analyzeBinary(node) {
    const left = analyze(node.left);
    const right = analyze(node.right);
    const leftTrivial = isTrivial(node.left);
    const rightTrivial = isTrivial(node.right);

    if (leftTrivial && rightTrivial)
      return NONE;

    const out = result({
      score: left.score + right.score,
      nestedDepth: Math.max(left.nestedDepth, right.nestedDepth),
      nested: left.nested || right.nested,
      branching: left.branching || right.branching,
      independentComputations: left.independentComputations || right.independentComputations
    });

    if (!leftTrivial && !rightTrivial && left.score > 0 && right.score > 0) {
      out.score += 1;
      out.independent = 2;
      out.independentComputations = true;
    }

    return out;
  }

  function analyzeConditional(node) {
    const test = analyze(node.test);
    const consequent = analyze(node.consequent);
    const alternate = analyze(node.alternate);
    const out = result({
      score: 1 + test.score + consequent.score + alternate.score,
      nestedDepth: Math.max(test.nestedDepth, consequent.nestedDepth, alternate.nestedDepth),
      nested: test.nested || consequent.nested || alternate.nested,
      branching: true,
      independentComputations:
        test.independentComputations ||
        consequent.independentComputations ||
        alternate.independentComputations
    });

    if (consequent.nestedDepth >= 1 && alternate.nestedDepth >= 1)
      out.score += 1;

    return out;
  }

  return analyze;
}

function flattenLogical(node, operator, acc) {
  const current = unwrap(node);

  if (current && current.type === 'LogicalExpression' && current.operator === operator) {
    flattenLogical(current.left, operator, acc);
    flattenLogical(current.right, operator, acc);
    return;
  }

  acc.push(node);
}

function collectObjectValues(node) {
  const values = [];

  for (const property of node.properties ?? []) {
    if (!property)
      continue;

    if (property.type === 'SpreadElement') {
      values.push(property.argument);
      continue;
    }

    if (property.type !== 'Property')
      continue;

    if (property.computed)
      values.push(property.key);

    if (property.value && !property.shorthand)
      values.push(property.value);
  }

  return values;
}

function childExpressions(node) {
  const current = unwrap(node);

  if (!current)
    return [];

  switch (current.type) {
    case 'CallExpression':
    case 'NewExpression':
      return callChildren(current);
    case 'MemberExpression': {
      const children = [current.object];

      if (current.computed)
        children.push(current.property);

      return children;
    }
    case 'ObjectExpression':
      return collectObjectValues(current);
    case 'ArrayExpression':
      return (current.elements ?? []).filter(Boolean);
    case 'ConditionalExpression':
      return [current.test, current.consequent, current.alternate];
    case 'LogicalExpression':
    case 'BinaryExpression':
      return [current.left, current.right];
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return current.body.type === 'BlockStatement' ? [] : [current.body];
    case 'AwaitExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
    case 'YieldExpression':
    case 'SpreadElement':
      return current.argument ? [current.argument] : [];
    case 'AssignmentExpression':
    case 'AssignmentPattern':
      return current.right ? [current.right] : [];
    case 'TemplateLiteral':
      return current.expressions;
    case 'TaggedTemplateExpression':
      return [current.tag, ...current.quasi.expressions];
    case 'SequenceExpression':
      return current.expressions;
    case 'ImportExpression':
      return current.source ? [current.source] : [];
    case 'ChainExpression':
      return current.expression ? [current.expression] : [];
    default:
      return current.expression ? [current.expression] : [];
  }
}

function callChildren(node) {
  const children = [];
  const callee = calleeOf(node);

  if (isMethodCallee(callee)) {
    children.push(callee.object);

    if (callee.computed)
      children.push(callee.property);
  } else if (node.callee) {
    children.push(node.callee);
  }

  for (const arg of argumentNodes(node))
    children.push(arg);

  return children;
}

function messageIdFor(analysis) {
  if (analysis.independentComputations)
    return 'independentComputations';

  if (analysis.branching)
    return 'branchingComputations';

  if (analysis.nested || analysis.nestedDepth >= 3)
    return 'nestedComputations';

  return 'complexExpression';
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Suggest extracting independent or nested computations into named steps instead of compressing them into one expression'
    },
    schema: [
      {
        type: 'object',
        properties: {
          threshold: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    ],
    defaultOptions: [{ threshold: DEFAULT_THRESHOLD }],
    messages: {
      independentComputations:
        'This expression contains multiple independent computations; consider extracting intermediate results.',
      nestedComputations:
        'This expression combines several nested computations; consider breaking it into named steps.',
      branchingComputations:
        'This expression combines branching with nested computation; consider extracting intermediate results.',
      complexExpression:
        'This expression contains multiple meaningful computations; consider breaking it into named steps.'
    }
  },
  create(context) {
    const threshold = context.options[0]?.threshold ?? DEFAULT_THRESHOLD;
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const analyze = createAnalyzer();
    const reported = new WeakSet();

    function isInsideReported(node) {
      if (reported.has(node))
        return true;

      const ancestors = sourceCode.getAncestors(node);

      return ancestors.some((ancestor) => reported.has(ancestor));
    }

    function check(node) {
      if (!node)
        return;

      if (isFunctionNode(node)) {
        const fn = unwrap(node);

        if (fn.body && fn.body.type !== 'BlockStatement')
          check(fn.body);

        return;
      }

      if (isInsideReported(node))
        return;

      const analysis = analyze(node);

      if (analysis.score >= threshold) {
        reported.add(node);
        context.report({
          node,
          messageId: messageIdFor(analysis)
        });
        return;
      }

      for (const child of childExpressions(node))
        check(child);
    }

    return {
      VariableDeclarator(node) {
        check(node.init);
      },
      ReturnStatement(node) {
        check(node.argument);
      },
      ThrowStatement(node) {
        check(node.argument);
      },
      ExpressionStatement(node) {
        const expression = node.expression;

        if (expression.type === 'AssignmentExpression')
          check(expression.right);
        else
          check(expression);
      },
      PropertyDefinition(node) {
        check(node.value);
      },
      AssignmentPattern(node) {
        check(node.right);
      },
      ArrowFunctionExpression(node) {
        if (node.body.type !== 'BlockStatement')
          check(node.body);
      },
      ExportDefaultDeclaration(node) {
        const declaration = node.declaration;

        if (!declaration || declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
          return;

        check(declaration);
      }
    };
  }
};
