import { stripTypeScriptTypes } from "node:module";
import * as ts from "typescript";

export function missingExports(
  source: string,
  required: readonly string[],
): string[] {
  const erased = stripTypeScriptTypes(source, { mode: "transform" });
  const file = ts.createSourceFile(
    "source.js",
    erased,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const found = new Set<string>();

  const nameText = (
    name: ts.ModuleExportName | ts.BindingName,
  ): string | undefined => {
    if (ts.isIdentifier(name)) return name.text;
    if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return undefined;
  };

  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);

  const bindingNames = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      found.add(name.text);
    } else if (
      ts.isObjectBindingPattern(name) ||
      ts.isArrayBindingPattern(name)
    ) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) bindingNames(element.name);
      }
    }
  };

  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (
        statement.exportClause &&
        ts.isNamespaceExport(statement.exportClause)
      ) {
        found.add(statement.exportClause.name.text);
      } else if (
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      ) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) {
            const name = nameText(element.name);
            if (name !== undefined) found.add(name);
          }
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) found.add("default");
      continue;
    }

    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        bindingNames(declaration.name);
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    ) {
      if (isDefault) {
        found.add("default");
      } else if (statement.name) {
        found.add(statement.name.text);
      }
    }
  }

  return required.filter((name) => !found.has(name));
}
