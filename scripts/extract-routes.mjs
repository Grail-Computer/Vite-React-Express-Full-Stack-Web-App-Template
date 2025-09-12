import fs from "fs"
import path from "path"
import { Project, SyntaxKind } from "ts-morph"

const SRC_DIR = path.resolve("client")

function getAllFiles(dir, ext, files = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      getAllFiles(full, ext, files)
    } else if (full.endsWith(ext)) {
      files.push(full)
    }
  }
  return files
}

function extractRoutesFromFile(filePath, project, routes) {
  const sourceFile = project.addSourceFileAtPath(filePath)

  sourceFile.forEachDescendant((node) => {
    if (
      node.getKind() === SyntaxKind.JsxSelfClosingElement ||
      node.getKind() === SyntaxKind.JsxOpeningElement
    ) {
      const tagName = node.getFirstChildByKind(SyntaxKind.Identifier)?.getText()
      if (tagName === "Route") {
        const pathAttr = node.getAttribute("path")
        if (pathAttr && pathAttr.getKind() === SyntaxKind.JsxAttribute) {
          const initializer = pathAttr.getFirstDescendantByKind(
            SyntaxKind.StringLiteral
          )
          if (initializer) {
            routes.push(initializer.getLiteralValue())
          }
        }
      }
    }
  })
}

function main() {
  const project = new Project()
  const tsxFiles = getAllFiles(SRC_DIR, ".tsx")
  const routes = []

  for (const file of tsxFiles) {
    extractRoutesFromFile(file, project, routes)
  }

  // Deduplicate
  const uniqueRoutes = [...new Set(routes)]

  console.log("Discovered routes:")
  console.log(JSON.stringify(uniqueRoutes, null, 2))
}

main()
