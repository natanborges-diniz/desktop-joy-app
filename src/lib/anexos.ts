// Helpers compartilhados para upload de anexos.
// Funciona em iOS (HEIC), Android (webview), desktop.

export type AnexoNormalizado = {
  blob: Blob;
  ext: string;
  mime: string;
  nome: string;
};

export function arquivoOriginal(file: File): AnexoNormalizado {
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  return {
    blob: file,
    ext,
    mime: file.type || "application/octet-stream",
    nome: file.name,
  };
}

async function carregarImagem(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler imagem"));
    };
    img.src = url;
  });
}

/**
 * Normaliza HEIC/HEIF → JPEG via canvas. Outros formatos passam direto.
 * Em caso de qualquer falha (Android webview sem createImageBitmap, etc.)
 * cai pro arquivo original.
 */
export async function normalizarAnexo(file: File): Promise<AnexoNormalizado> {
  try {
    const nome = file.name || "arquivo";
    const ehHeic =
      /\.(heic|heif)$/i.test(nome) || /image\/(heic|heif)/i.test(file.type);
    if (!ehHeic) return arquivoOriginal(file);

    const imagem =
      typeof createImageBitmap === "function"
        ? await createImageBitmap(file)
        : await carregarImagem(file);

    const MAX = 1600;
    const ratio = Math.min(1, MAX / Math.max(imagem.width, imagem.height));
    const w = Math.round(imagem.width * ratio);
    const h = Math.round(imagem.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.drawImage(imagem as CanvasImageSource, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Falha ao converter imagem"))),
        "image/jpeg",
        0.85,
      ),
    );

    const baseNome = nome.replace(/\.[^.]+$/, "");
    return { blob, ext: "jpg", mime: "image/jpeg", nome: `${baseNome}.jpg` };
  } catch (error) {
    console.warn("[normalizarAnexo] fallback para arquivo original:", error);
    return arquivoOriginal(file);
  }
}

export function descreverErroUpload(error: unknown): string {
  if (!error) return "erro desconhecido";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const anyErr = error as { message?: string; error?: string };
    if (anyErr.message) return anyErr.message;
    if (anyErr.error) return anyErr.error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
