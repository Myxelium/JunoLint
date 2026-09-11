'use strict';

const WRAPPERS = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression'
]);

const CLASS_MEMBER_TYPES = new Set([
  'MethodDefinition',
  'PropertyDefinition',
  'AccessorProperty',
  'TSAbstractMethodDefinition',
  'TSAbstractPropertyDefinition'
]);

const DEPRECATED_TAG = /@deprecated(?![\w-])/;

function unwrap(node) {
  let current = node;

  while (current && WRAPPERS.has(current.type) && current.expression && current.expression !== current)
    current = current.expression;

  return current;
}

function findVariable(scope, name) {
  let current = scope;

  while (current) {
    const found = current.set.get(name);

    if (found)
      return found;

    current = current.upper;
  }

  return null;
}

function keyName(key, computed) {
  if (!key)
    return '';

  if (computed) {
    if (key.type === 'Literal' && typeof key.value === 'string')
      return key.value;

    return '';
  }

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  if (key.type === 'Literal' && typeof key.value === 'string')
    return key.value;

  return '';
}

function memberName(member) {
  return keyName(member.key, member.computed);
}

function parameterPropertyName(param) {
  const inner = param.type === 'TSParameterProperty' ? param.parameter : param;

  if (!inner)
    return '';

  if (inner.type === 'Identifier')
    return inner.name;

  if (inner.type === 'AssignmentPattern' && inner.left && inner.left.type === 'Identifier')
    return inner.left.name;

  return '';
}

function commentText(comment) {
  return typeof comment.value === 'string' ? comment.value : '';
}

function extractDeprecatedReason(text) {
  const start = text.search(DEPRECATED_TAG);

  if (start === -1)
    return null;

  let rest = text.slice(start + '@deprecated'.length);
  const nextTag = rest.search(/\n\s*\**\s*@\w/);

  if (nextTag !== -1)
    rest = rest.slice(0, nextTag);

  const reason = rest
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .join(' ')
    .trim();

  return reason;
}

function leadingDeprecated(sourceCode, node) {
  if (!node)
    return null;

  const jsdoc = typeof sourceCode.getJSDocComment === 'function'
    ? sourceCode.getJSDocComment(node)
    : null;

  if (jsdoc) {
    const reason = extractDeprecatedReason(commentText(jsdoc));

    if (reason !== null)
      return reason;
  }

  const comments = sourceCode.getCommentsBefore(node);

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (comment.type !== 'Block')
      continue;

    const reason = extractDeprecatedReason(commentText(comment));

    if (reason !== null)
      return reason;
  }

  return null;
}

function deprecationOn(sourceCode, node) {
  if (!node)
    return null;

  const seen = new Set();
  let current = node;

  while (current && !seen.has(current)) {
    seen.add(current);

    const reason = leadingDeprecated(sourceCode, current);

    if (reason !== null)
      return reason;

    if (current.decorators && current.decorators.length > 0) {
      const beforeDecorator = leadingDeprecated(sourceCode, current.decorators[0]);

      if (beforeDecorator !== null)
        return beforeDecorator;
    }

    const parent = current.parent;

    if (!parent)
      break;

    if (parent.type === 'VariableDeclaration' && parent.declarations.includes(current)) {
      current = parent;
      continue;
    }

    if (
      (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration') &&
      parent.declaration === current
    ) {
      current = parent;
      continue;
    }

    break;
  }

  return null;
}

function deprecationForDef(sourceCode, def) {
  if (!def)
    return null;

  if (def.name) {
    const onName = leadingDeprecated(sourceCode, def.name);

    if (onName !== null)
      return onName;
  }

  const onNode = deprecationOn(sourceCode, def.node);

  if (onNode !== null)
    return onNode;

  if (def.parent && def.parent !== def.node)
    return deprecationOn(sourceCode, def.parent);

  return null;
}

function deprecationForVariable(sourceCode, variable) {
  if (!variable)
    return null;

  for (const def of variable.defs) {
    const reason = deprecationForDef(sourceCode, def);

    if (reason !== null)
      return reason;
  }

  return null;
}

function isClassNode(node) {
  return Boolean(node && (node.type === 'ClassDeclaration' || node.type === 'ClassExpression'));
}

function constructorOf(classNode) {
  if (!classNode || !classNode.body)
    return null;

  for (const member of classNode.body.body) {
    if (member.type === 'MethodDefinition' && member.kind === 'constructor')
      return member;
  }

  return null;
}

function findMemberInClass(classNode, name, instance) {
  if (!classNode || !classNode.body)
    return null;

  for (const member of classNode.body.body) {
    if (!CLASS_MEMBER_TYPES.has(member.type))
      continue;

    if (Boolean(member.static) === Boolean(instance))
      continue;

    if (memberName(member) === name)
      return member;
  }

  const ctor = constructorOf(classNode);

  if (instance && ctor && ctor.value) {
    for (const param of ctor.value.params) {
      if (param.type !== 'TSParameterProperty')
        continue;

      if (parameterPropertyName(param) === name)
        return param;
    }
  }

  return null;
}

function findTypeAwareDeprecation(context, node) {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const services = sourceCode.parserServices ?? context.parserServices;

  if (!services || !services.program || !services.esTreeNodeToTSNodeMap)
    return null;

  let typescript;

  try {
    typescript = require('typescript');
  } catch {
    return null;
  }

  const tsNode = services.esTreeNodeToTSNodeMap.get(node);

  if (!tsNode)
    return null;

  try {
    const checker = services.program.getTypeChecker();
    const symbol = checker.getSymbolAtLocation(tsNode);
    const resolved = symbol && symbol.flags & typescript.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
    const tagged = resolved || symbol;

    if (!tagged || typeof tagged.getJsDocTags !== 'function')
      return null;

    const tags = tagged.getJsDocTags(checker);
    const tag = tags.find((entry) => entry.name === 'deprecated');

    if (!tag)
      return null;

    const reason = tag.text && typeof typescript.displayPartsToString === 'function'
      ? typescript.displayPartsToString(tag.text).trim()
      : '';

    return {
      name: typeof tagged.getName === 'function' ? tagged.getName() : '',
      reason
    };
  } catch {
    return null;
  }
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow using values, types, and members marked with @deprecated'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      deprecated: '{{name}} is deprecated.',
      deprecatedWithReason: '{{name}} is deprecated. {{reason}}'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const allowed = new Set(context.options[0]?.allow ?? []);
    const reported = new WeakSet();

    function report(node, name, reason) {
      if (!node || reported.has(node))
        return;

      if (typeof name === 'string' && allowed.has(name))
        return;

      reported.add(node);

      if (reason) {
        context.report({
          node,
          messageId: 'deprecatedWithReason',
          data: { name, reason }
        });
        return;
      }

      context.report({
        node,
        messageId: 'deprecated',
        data: { name }
      });
    }

    function reportDeprecated(node, name, reason) {
      report(node, name || 'This API', reason);
    }

    function checkTypeAware(node, fallbackName) {
      const info = findTypeAwareDeprecation(context, node);

      if (!info)
        return false;

      reportDeprecated(node, info.name || fallbackName, info.reason);
      return true;
    }

    function variableOf(identifier) {
      if (!identifier || identifier.type !== 'Identifier')
        return null;

      return findVariable(sourceCode.getScope(identifier), identifier.name);
    }

    function resolveClassBinding(variable, seen) {
      const visited = seen ?? new Set();

      if (!variable || visited.has(variable))
        return null;

      visited.add(variable);

      for (const def of variable.defs) {
        if (isClassNode(def.node))
          return { classNode: def.node, instance: false };

        if (def.type !== 'Variable' || !def.node || !def.node.init)
          continue;

        const init = unwrap(def.node.init);

        if (isClassNode(init))
          return { classNode: init, instance: false };

        if (init.type === 'NewExpression') {
          const callee = unwrap(init.callee);

          if (callee.type === 'Identifier') {
            const inner = resolveClassBinding(variableOf(callee), visited);

            if (inner)
              return { classNode: inner.classNode, instance: true };
          }
        }

        if (init.type === 'Identifier') {
          const inner = resolveClassBinding(variableOf(init), visited);

          if (inner)
            return inner;
        }
      }

      return null;
    }

    function heritageClass(classNode, seen) {
      if (!classNode || !classNode.superClass)
        return null;

      const parent = unwrap(classNode.superClass);

      if (parent.type !== 'Identifier')
        return null;

      const binding = resolveClassBinding(variableOf(parent), seen);

      return binding ? binding.classNode : null;
    }

    function findClassMember(classNode, name, instance, seen) {
      const visited = seen ?? new Set();

      if (!classNode || visited.has(classNode))
        return null;

      visited.add(classNode);

      const member = findMemberInClass(classNode, name, instance);

      if (member)
        return member;

      return findClassMember(heritageClass(classNode, visited), name, instance, visited);
    }

    function enumOf(variable) {
      if (!variable)
        return null;

      for (const def of variable.defs) {
        if (def.node && def.node.type === 'TSEnumDeclaration')
          return def.node;
      }

      return null;
    }

    function findEnumMember(enumNode, name) {
      if (!enumNode)
        return null;

      for (const member of enumNode.members) {
        if (keyName(member.id, false) === name)
          return member;
      }

      return null;
    }

    function isDefiningIdentifier(identifier, variable) {
      return Boolean(variable && variable.defs.some((def) => def.name === identifier));
    }

    function checkVariableUse(identifier, variable) {
      if (isDefiningIdentifier(identifier, variable))
        return;

      if (checkTypeAware(identifier, identifier.name))
        return;

      const reason = deprecationForVariable(sourceCode, variable);

      if (reason === null)
        return;

      reportDeprecated(identifier, identifier.name, reason);
    }

    function checkMember(node) {
      const name = keyName(node.property, node.computed);

      if (!name)
        return;

      if (checkTypeAware(node.property, name))
        return;

      const object = unwrap(node.object);

      if (object.type === 'ThisExpression' || object.type === 'Super') {
        let current = node.parent;

        while (current && !isClassNode(current))
          current = current.parent;

        if (!current)
          return;

        const start = object.type === 'Super'
          ? heritageClass(current)
          : current;
        const member = findClassMember(start, name, true);

        if (!member)
          return;

        const reason = deprecationOn(sourceCode, member);

        if (reason === null)
          return;

        reportDeprecated(node.property, name, reason);
        return;
      }

      if (object.type !== 'Identifier')
        return;

      const variable = variableOf(object);
      const enumNode = enumOf(variable);

      if (enumNode) {
        const member = findEnumMember(enumNode, name);

        if (member) {
          const reason = deprecationOn(sourceCode, member);

          if (reason !== null)
            reportDeprecated(node.property, name, reason);
        }

        return;
      }

      const binding = resolveClassBinding(variable);

      if (!binding)
        return;

      const member = findClassMember(binding.classNode, name, binding.instance);

      if (!member)
        return;

      const reason = deprecationOn(sourceCode, member);

      if (reason === null)
        return;

      reportDeprecated(node.property, name, reason);
    }

    function checkNewExpression(node) {
      const callee = unwrap(node.callee);

      if (callee.type !== 'Identifier')
        return;

      const binding = resolveClassBinding(variableOf(callee));

      if (!binding || binding.instance)
        return;

      const ctor = constructorOf(binding.classNode);

      if (!ctor)
        return;

      const reason = deprecationOn(sourceCode, ctor);

      if (reason === null)
        return;

      reportDeprecated(callee, callee.name, reason);
    }

    function checkSuperCall(node) {
      const callee = unwrap(node.callee);

      if (callee.type !== 'Super')
        return;

      let current = node.parent;

      while (current && !isClassNode(current))
        current = current.parent;

      const base = current ? heritageClass(current) : null;
      const ctor = constructorOf(base);

      if (!ctor)
        return;

      const reason = deprecationOn(sourceCode, ctor);

      if (reason === null)
        return;

      reportDeprecated(callee, 'super', reason);
    }

    return {
      MemberExpression: checkMember,
      'Program:exit'(program) {
        const rootScope = sourceCode.getScope(program);

        function visitScope(scope) {
          for (const ref of scope.references) {
            if (!ref.identifier)
              continue;

            if (ref.resolved)
              checkVariableUse(ref.identifier, ref.resolved);
            else
              checkTypeAware(ref.identifier, ref.identifier.name);
          }

          for (const child of scope.childScopes)
            visitScope(child);
        }

        visitScope(rootScope);
      },
      NewExpression: checkNewExpression,
      CallExpression: checkSuperCall
    };
  }
};
