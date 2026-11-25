"use client";

/**
 * La identidad del copiloto: su nombre y su cara.
 *
 * Están aquí, juntos y solos, para que cambiarlos sea editar dos líneas y no
 * perseguir cadenas por doce archivos. Mientras no se decida el nombre
 * definitivo, lo que hay abajo es una propuesta y nada más.
 *
 * Las tres caras son diseño propio. No hay logotipos de terceros ni nada que
 * se parezca a una marca registrada: las cadenas del canal aparecen en la
 * plataforma como monogramas por la misma razón.
 */

export const AGENTE = {
  /** Cambiar aquí el nombre y cambia en toda la plataforma. */
  nombre: "Argos",
  /** Ver el tipo Avatar: hay ocho caras y se cambia escribiendo otra aquí. */
  avatar: "visor" as Avatar,
  oficio: "Inteligencia comercial y planeación",
};

export type Avatar =
  | "monograma"
  | "lente"
  /** La familia de cabezas. Misma estructura, distinto carácter. */
  | "kala"
  | "ciclope"
  | "visor"
  | "panoptico"
  | "centinela"
  | "guardia";

/* ------------------------------------------------------------------ caras */

/** A. Monograma. La inicial en un cuadro redondeado. Sobrio, de traje. */
function Monograma({ s, letra }: { s: number; letra: string }) {
  return (
    <svg viewBox="0 0 40 40" width={s} height={s} className="cara" style={{ width: s, height: s }} aria-hidden>
      <defs>
        <linearGradient id="ag-mono" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#ag-mono)" />
      <text
        x="20"
        y="27.5"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="19"
        fontWeight="700"
        fill="#fff"
      >
        {letra}
      </text>
    </svg>
  );
}

/**
 * B. Lente. Un diafragma hecho con las mismas barras con las que la
 * plataforma dibuja sus gráficas. Dice "esto mira el canal" sin decirlo.
 */
function Lente({ s }: { s: number }) {
  return (
    <svg viewBox="0 0 40 40" width={s} height={s} className="cara" style={{ width: s, height: s }} aria-hidden>
      <defs>
        <linearGradient id="ag-lente" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#15263d" />
          <stop offset="100%" stopColor="#0c1a2e" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#ag-lente)" />
      <circle cx="20" cy="20" r="11.5" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.4" />
      {/* Las cuatro barras del diafragma, con las alturas de una gráfica. */}
      <rect x="12.4" y="20.5" width="3.1" height="6.4" rx="1.4" fill="var(--s1)" />
      <rect x="17" y="16.4" width="3.1" height="10.5" rx="1.4" fill="#5fa8f5" />
      <rect x="21.6" y="18.8" width="3.1" height="8.1" rx="1.4" fill="var(--s4)" />
      <circle cx="20" cy="12.6" r="2.5" fill="var(--warn)" />
    </svg>
  );
}

/**
 * C. Kala. Cabeza mínima, hermana de la mascota de MarkaLab: misma familia,
 * identidad propia. Es la que más calor aporta en una sala de directivos y la
 * que más hay que cuidar para que no se vuelva caricatura.
 */
function Kala({ s }: { s: number }) {
  return (
    <svg viewBox="0 0 40 40" width={s} height={s} className="cara" style={{ width: s, height: s }} aria-hidden>
      <defs>
        <linearGradient id="ag-kala" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f5fd8" />
          <stop offset="100%" stopColor="#0f49b5" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#ag-kala)" />
      {/* antena */}
      <line x1="20" y1="7.5" x2="20" y2="11.5" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="6.6" r="1.9" fill="var(--warn)" />
      {/* cabeza */}
      <rect x="9.5" y="11.5" width="21" height="16.5" rx="6.2" fill="#fff" opacity=".96" />
      {/* ojos: uno redondo y uno en arco, que es lo que da el gesto */}
      <circle cx="16.2" cy="19.3" r="2.25" fill="#0c1a2e" />
      <path d="M22.1 20.2 a2.4 2.4 0 0 1 4.3 0" fill="none" stroke="#0c1a2e" strokeWidth="2.1" strokeLinecap="round" />
      {/* base */}
      <rect x="15.5" y="29.4" width="9" height="2.6" rx="1.3" fill="rgba(255,255,255,.4)" />
    </svg>
  );
}


/* --------------------------------------------------- la familia de cabezas
 * Las cinco de abajo son hermanas de la opción C: mismo cuerpo, misma paleta,
 * mismo peso visual. Lo único que cambia es la cara, que es donde está el
 * carácter. Todas están dibujadas para leerse a 22 px, que es el tamaño al
 * que de verdad se van a ver dentro de una burbuja del panel.
 */

/** Cuerpo común: fondo, antena y cabeza. Las caras se dibujan encima. */
function Cuerpo({ s, children, antena = true }: { s: number; children: React.ReactNode; antena?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" width={s} height={s} className="cara" style={{ width: s, height: s }} aria-hidden>
      <defs>
        <linearGradient id="ag-cuerpo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1f5fd8" />
          <stop offset="100%" stopColor="#0f49b5" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="11" fill="url(#ag-cuerpo)" />
      {antena ? (
        <>
          <line x1="20" y1="7.5" x2="20" y2="11.5" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="20" cy="6.6" r="1.9" fill="var(--warn)" />
        </>
      ) : null}
      <rect x="9.5" y="11.5" width="21" height="16.5" rx="6.2" fill="#fff" opacity=".96" />
      {children}
      <rect x="15.5" y="29.4" width="9" height="2.6" rx="1.3" fill="rgba(255,255,255,.4)" />
    </svg>
  );
}

/** D. Cíclope. Un ojo grande y nada más. El que mejor se lee en chico. */
function Ciclope({ s }: { s: number }) {
  return (
    <Cuerpo s={s}>
      <circle cx="20" cy="19.6" r="4.7" fill="#0c1a2e" />
      <circle cx="21.7" cy="17.9" r="1.5" fill="#fff" />
    </Cuerpo>
  );
}

/** E. Visor. Una banda que barre, con la luz encendida en un extremo. */
function Visor({ s }: { s: number }) {
  return (
    <Cuerpo s={s}>
      <rect x="12.4" y="17" width="15.2" height="5.4" rx="2.7" fill="#0c1a2e" />
      <circle cx="24.4" cy="19.7" r="1.35" fill="var(--warn)" />
      <rect x="7.6" y="17.8" width="1.8" height="4" rx="0.9" fill="rgba(255,255,255,.55)" />
      <rect x="30.6" y="17.8" width="1.8" height="4" rx="0.9" fill="rgba(255,255,255,.55)" />
    </Cuerpo>
  );
}

/** F. Panóptico. El iris hecho de ojitos: los cien de Argos, en seis. */
function Panoptico({ s }: { s: number }) {
  const puntos = [0, 60, 120, 180, 240, 300].map((g) => {
    const r = (g * Math.PI) / 180;
    return { x: 20 + Math.cos(r) * 3.3, y: 19.6 + Math.sin(r) * 3.3 };
  });
  return (
    <Cuerpo s={s}>
      <circle cx="20" cy="19.6" r="5.3" fill="none" stroke="#0c1a2e" strokeWidth="1.3" />
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="0.95" fill="#0c1a2e" />
      ))}
      <circle cx="20" cy="19.6" r="1.5" fill="var(--warn)" />
    </Cuerpo>
  );
}

/** G. Centinela. Dos ojos de frente y una sonrisa corta. El más cálido. */
function Centinela({ s }: { s: number }) {
  return (
    <Cuerpo s={s}>
      <circle cx="16.1" cy="18.6" r="2.15" fill="#0c1a2e" />
      <circle cx="23.9" cy="18.6" r="2.15" fill="#0c1a2e" />
      <path d="M17.2 23.3 a3.4 3.4 0 0 0 5.6 0" fill="none" stroke="#0c1a2e" strokeWidth="1.7" strokeLinecap="round" />
    </Cuerpo>
  );
}

/** H. Guardia. Casco en vez de antena. El de postura más firme. */
function Guardia({ s }: { s: number }) {
  return (
    <Cuerpo s={s} antena={false}>
      <path d="M9.5 17.6 v-0.1 a6.2 6.2 0 0 1 6.2-6 h8.6 a6.2 6.2 0 0 1 6.2 6 v0.1 z" fill="#0c1a2e" />
      <circle cx="20" cy="9.4" r="1.9" fill="var(--warn)" />
      <circle cx="16.1" cy="21.8" r="2.05" fill="#0c1a2e" />
      <circle cx="23.9" cy="21.8" r="2.05" fill="#0c1a2e" />
    </Cuerpo>
  );
}

export function CaraAgente({
  tamano = 28,
  variante,
}: {
  tamano?: number;
  variante?: Avatar;
}) {
  const v = variante ?? AGENTE.avatar;
  if (v === "monograma") return <Monograma s={tamano} letra={AGENTE.nombre[0]} />;
  if (v === "kala") return <Kala s={tamano} />;
  if (v === "ciclope") return <Ciclope s={tamano} />;
  if (v === "visor") return <Visor s={tamano} />;
  if (v === "panoptico") return <Panoptico s={tamano} />;
  if (v === "centinela") return <Centinela s={tamano} />;
  if (v === "guardia") return <Guardia s={tamano} />;
  return <Lente s={tamano} />;
}
