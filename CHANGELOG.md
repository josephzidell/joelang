# Changelog

While we usually try to adhere to [https://semver.org/](https://semver.org/), while joelang is being built, almost every merge will contain breaking changes.

## 2022-09-18

### Additions
- Support for interfaces:
- Adds `interface` keyword
- Adds `InterfaceDeclaration` and `InterfaceExtensionsList` nodes

### Changes
- Throw error if `extends` is used outside of a `ClassDeclaration` or `InterfaceDeclaration`

### Removals
None


## 2022-09-18

### Additions
- Changelog!
- Adds `print` token
- Adds `ClassDeclaration`, `Parameter`, `ParametersList`, and `PrintStatement` nodes

### Changes
- Renames `filepath` -> `path` token
- Renames `FilePath` -> `Path` and `FunctionDefinition` -> `FunctionDeclaration` nodes
- Moves position-related data in `Node` -> `Node.pos`
- All `*Separator` nodes now show up after the expression
- Moves example screenshots from `examples/` -> `docs_assets/`
- Moves `tests/fixtures/` -> `examples/`
- Renames AST to Parse Tree / Concrete Syntax Tree (CST)

### Removals
None
