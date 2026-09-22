/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Importação por planilha (app/(app)/importar/actions.ts): o arquivo sobe
    // por Server Action, e o padrão do Next é 1 MB. O limite do produto é
    // 5 MB (lib/importacao/leitor.ts) — 6 MB aqui dá folga para o
    // envelope multipart.
    serverActions: { bodySizeLimit: "6mb" },
    // exceljs é CommonJS com dependências pesadas (jszip, archiver): fica
    // fora do bundle do servidor e é carregado do node_modules em runtime.
    serverComponentsExternalPackages: ["exceljs"],
  },
};

export default nextConfig;
