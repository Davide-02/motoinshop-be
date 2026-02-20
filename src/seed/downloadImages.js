require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const mongoose = require("mongoose");
const Product = require("../models/Product");

const UPLOADS_DIR = path.join(__dirname, "../../uploads/products");
const BATCH_SIZE = 10;
const DELAY_BETWEEN_IMAGES = 500; // ms tra ogni immagine

// Assicurati che la cartella esista
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scarica immagine con curl
function downloadWithCurl(url, filePath) {
  try {
    // Usa curl con timeout, follow redirect, e user agent
    execSync(
      `curl -L -s -S --max-time 30 --connect-timeout 10 ` +
      `-A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" ` +
      `-H "Referer: https://motoinshop.it/" ` +
      `-o "${filePath}" "${url}"`,
      { stdio: 'pipe', timeout: 45000 }
    );
    
    // Verifica che il file sia stato creato e non sia vuoto
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        return true;
      }
      fs.unlinkSync(filePath);
    }
    return false;
  } catch (err) {
    // Rimuovi file parziale
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return false;
  }
}

// Genera nome file unico dall'URL
function getFilenameFromUrl(url, productId, index) {
  try {
    const urlObj = new URL(url);
    const originalName = path.basename(urlObj.pathname);
    const ext = path.extname(originalName) || ".jpg";
    const name = path.basename(originalName, ext)
      .substring(0, 50)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${productId}_${index}_${name}${ext}`;
  } catch {
    return `${productId}_${index}.jpg`;
  }
}

async function main() {
  console.log("=== Download Immagini Prodotti (curl) ===\n");
  console.log(`Cartella: ${UPLOADS_DIR}\n`);

  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: "motoin" });
    console.log("MongoDB connesso\n");

    // Trova tutti i prodotti con immagini remote
    const products = await Product.find({
      images: { $exists: true, $ne: [] },
    }).lean();

    console.log(`Prodotti totali con immagini: ${products.length}\n`);

    const stats = {
      processed: 0,
      downloaded: 0,
      skipped: 0,
      errors: 0,
      noRemote: 0,
    };

    for (const product of products) {
      if (!product.images || product.images.length === 0) continue;

      const newImages = [];
      let hasChanges = false;
      let hasRemoteImages = false;

      for (let i = 0; i < product.images.length; i++) {
        const imageUrl = product.images[i];

        // Salta se già locale
        if (!imageUrl || imageUrl.startsWith("/api/images/")) {
          newImages.push(imageUrl);
          continue;
        }

        // Salta URL non validi
        if (!imageUrl.startsWith("http")) {
          newImages.push(imageUrl);
          continue;
        }

        hasRemoteImages = true;
        const filename = getFilenameFromUrl(imageUrl, product._id.toString(), i);
        const filePath = path.join(UPLOADS_DIR, filename);
        const localUrl = `/api/images/${filename}`;

        // Se già scaricata, salta
        if (fs.existsSync(filePath)) {
          stats.skipped++;
          newImages.push(localUrl);
          hasChanges = true;
          continue;
        }

        // Scarica con curl
        console.log(`  Scaricando: ${path.basename(imageUrl)}`);
        const success = downloadWithCurl(imageUrl, filePath);

        if (success) {
          stats.downloaded++;
          newImages.push(localUrl);
          hasChanges = true;
        } else {
          stats.errors++;
          console.log(`    ERRORE: ${imageUrl}`);
          newImages.push(imageUrl); // Mantieni URL originale
        }

        await delay(DELAY_BETWEEN_IMAGES);
      }

      if (!hasRemoteImages) {
        stats.noRemote++;
      }

      // Aggiorna il prodotto se ci sono cambiamenti
      if (hasChanges) {
        await Product.updateOne({ _id: product._id }, { $set: { images: newImages } });
        stats.processed++;
      }

      // Log progresso ogni 10 prodotti
      const total = stats.processed + stats.noRemote;
      if (total % 10 === 0) {
        console.log(
          `\n[${total}/${products.length}] ` +
          `Scaricate: ${stats.downloaded} | Saltate: ${stats.skipped} | Errori: ${stats.errors}\n`
        );
      }
    }

    console.log("\n=== Completato ===");
    console.log(`Prodotti aggiornati: ${stats.processed}`);
    console.log(`Prodotti senza immagini remote: ${stats.noRemote}`);
    console.log(`Immagini scaricate: ${stats.downloaded}`);
    console.log(`Immagini già presenti: ${stats.skipped}`);
    console.log(`Errori: ${stats.errors}`);

    process.exit(0);
  } catch (err) {
    console.error("Errore:", err);
    process.exit(1);
  }
}

main();
