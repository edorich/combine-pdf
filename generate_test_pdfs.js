const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createPDF(filename, text, color) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawText(text, {
    x: 50,
    y: 200,
    size: 32,
    font: font,
    color: color
  });

  const pdfBytes = await pdfDoc.save();
  const dir = path.join(__dirname, 'test-pdfs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  fs.writeFileSync(path.join(dir, filename), pdfBytes);
  console.log(`Generated ${filename}`);
}

async function createMultipagePDF(filename, numPages) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= numPages; i++) {
    const page = pdfDoc.addPage([600, 400]);
    // Cycle colors
    const color = rgb(
      (0.1 * i) % 0.8 + 0.1,
      (0.2 * i) % 0.8 + 0.1,
      (0.3 * i) % 0.8 + 0.1
    );

    page.drawText(`Page ${i} of ${numPages}`, {
      x: 50,
      y: 250,
      size: 36,
      font: font,
      color: color
    });

    page.drawText(`PDF Combiner Pro Test Document`, {
      x: 50,
      y: 150,
      size: 18,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });
  }

  const pdfBytes = await pdfDoc.save();
  const dir = path.join(__dirname, 'test-pdfs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  fs.writeFileSync(path.join(dir, filename), pdfBytes);
  console.log(`Generated Multipage PDF: ${filename} (${numPages} pages)`);
}

async function main() {
  await createPDF('document_A.pdf', 'Document A - Page 1', rgb(0.1, 0.5, 0.9));
  await createPDF('document_B.pdf', 'Document B - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_C.pdf', 'Document C - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_D.pdf', 'Document D - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_E.pdf', 'Document E - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_F.pdf', 'Document F - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_G.pdf', 'Document G - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_H.pdf', 'Document H - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_I.pdf', 'Document I - Page 1', rgb(0.9, 0.2, 0.4));
  await createPDF('document_J.pdf', 'Document J - Page 1', rgb(0.9, 0.2, 0.4));
  await createMultipagePDF('multipage_10.pdf', 10);
}

main().catch(console.error);
