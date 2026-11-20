/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* Las plantillas de Excel viven en public/ y la ruta /api/excel las lee del
     disco. En Vercel, lo que está en public/ se sirve desde la red de
     distribución y no viaja con la función a menos que se le diga. Sin esta
     línea la descarga funciona en la máquina de uno y falla desplegada. */
  outputFileTracingIncludes: {
    "/api/excel": ["./public/plantillas/**"],
  },
};
export default nextConfig;
