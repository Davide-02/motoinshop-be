const express = require("express");
const productsRouter = require("./products");

const router = express.Router();

// Verticali che, al momento, usano lo stesso modello/CRUD dei prodotti.
// Evita collisioni con route statiche del gestionale FE (es. /dashboard/moto).
const PRODUCT_LIKE_VERTICALS = new Set(["moto", "shop", "moto-shop", "negozio"]);

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function validateProductLikePayload(body, { partial }) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { ok: false, errors: ["Body deve essere un oggetto JSON"] };
  }

  const ensureString = (key, required) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v == null) {
      if (required) errors.push(`${key} è obbligatorio`);
      return;
    }
    if (typeof v !== "string") errors.push(`${key} deve essere una stringa`);
    else if (required && !v.trim()) errors.push(`${key} non può essere vuoto`);
  };

  const ensureNumber = (key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v == null || v === "") return;
    if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${key} deve essere un numero`);
  };

  const ensureBoolean = (key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v == null) return;
    if (typeof v !== "boolean") errors.push(`${key} deve essere boolean`);
  };

  const ensureStringArray = (key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v == null) return;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      errors.push(`${key} deve essere un array di stringhe`);
    }
  };

  if (!partial) {
    ensureString("name", true);
  } else {
    if ("name" in body) ensureString("name", true);
  }

  ensureString("sku", false);
  ensureString("code", false);
  ensureString("barcode", false);
  ensureString("shortDescription", false);
  ensureString("description", false);

  ["price", "regularPrice", "salePrice", "mechanicalPrice", "wholesalePrice"].forEach(ensureNumber);
  ensureNumber("stock");

  if ("stock" in body && typeof body.stock === "number" && body.stock < 0) {
    errors.push("stock non può essere negativo");
  }

  ensureBoolean("inStock");
  ensureBoolean("published");

  ["categories", "tags", "images", "subcategories"].forEach(ensureStringArray);

  if ("compatibility" in body && body.compatibility != null) {
    const v = body.compatibility;
    if (!Array.isArray(v)) {
      errors.push("compatibility deve essere un array");
    } else {
      for (let i = 0; i < v.length; i++) {
        const row = v[i];
        if (!isPlainObject(row)) {
          errors.push(`compatibility[${i}] deve essere un oggetto`);
          continue;
        }
        if ("brand" in row && row.brand != null && typeof row.brand !== "string") {
          errors.push(`compatibility[${i}].brand deve essere una stringa`);
        }
        if ("model" in row && row.model != null && typeof row.model !== "string") {
          errors.push(`compatibility[${i}].model deve essere una stringa`);
        }
        if ("cilindrata" in row && row.cilindrata != null) {
          if (typeof row.cilindrata !== "number" || !Number.isFinite(row.cilindrata)) {
            errors.push(`compatibility[${i}].cilindrata deve essere un numero`);
          }
        }
        if ("years" in row && row.years != null) {
          if (!Array.isArray(row.years) || row.years.some((y) => typeof y !== "number" || !Number.isFinite(y))) {
            errors.push(`compatibility[${i}].years deve essere un array di numeri`);
          }
        }
        if ("frame" in row && row.frame != null && typeof row.frame !== "string") {
          errors.push(`compatibility[${i}].frame deve essere una stringa`);
        }
        if ("posizione" in row && row.posizione != null && typeof row.posizione !== "string") {
          errors.push(`compatibility[${i}].posizione deve essere una stringa`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function ensureSupportedVertical(req, res, next) {
  const vertical = String(req.params.vertical || "").toLowerCase();
  if (!PRODUCT_LIKE_VERTICALS.has(vertical)) {
    return res.status(404).json({ error: "Verticale non supportato" });
  }
  req.vertical = vertical;
  next();
}

function validateBodyForCrud(req, res, next) {
  // Mounted under "/:vertical/items"
  // - POST "/" => create
  // - PUT "/:id" => update
  // Skip multipart endpoints (upload-images) and any other POST subpaths.
  if (req.method === "POST" && req.path === "/") {
    const result = validateProductLikePayload(req.body, { partial: false });
    if (!result.ok) {
      return res.status(400).json({ error: "Payload non valido", details: result.errors });
    }
  }

  if (req.method === "PUT" && /^\/[^/]+$/.test(req.path)) {
    const result = validateProductLikePayload(req.body, { partial: true });
    if (!result.ok) {
      return res.status(400).json({ error: "Payload non valido", details: result.errors });
    }
  }

  next();
}

router.use("/:vertical/items", ensureSupportedVertical, validateBodyForCrud, productsRouter);

module.exports = router;
