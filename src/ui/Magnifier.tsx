/**
 * The magnified inset (round four; see state/magnifier.ts). In a DUV immersion scanner the
 * water between the last lens element and the wafer is about a millimetre thick, held under the
 * lens by the immersion hood around it while the wafer is stepped and scanned beneath: at the
 * machine's scale it is a line, so the page draws it here, titled as a magnified schematic,
 * instead of drawing the gap larger than it is. The drawing is a half section from the lens
 * axis (left edge) out past the hood; heights are to one scale (the gap is marked), widths are
 * compressed. The wafer's surface moves with the stage (the scene redraws the inset with each
 * frame it renders), and the 193 nm light is drawn only with the light-path overlay, as in
 * the scene.
 */
import { useLayoutEffect, useRef } from 'react';
import { magnifierFrame, useMagnifier } from '../state/magnifier';
import { useStageInfo } from '../three/stage/info';

/** Wafer top and the heights above it (px; 22 px per millimetre). */
const MM = 22;
const WY = 98;
const LENS_Y = WY - MM; // the last element's underside: 1 mm over the wafer
const HOOD_Y = WY - 0.5 * MM; // the hood's underside: 0.5 mm
/** Horizontal scale of the wafer's motion (px per mm of stage travel; widths are compressed). */
const TRAVEL = 5;
/** Period of the marks drawn on the wafer's surface (px). */
const PERIOD = 24;

export function Magnifier() {
  const kind = useMagnifier((s) => s.kind);
  const cutaway = useStageInfo((s) => s.cutaway);
  const scale = useStageInfo((s) => s.scale);
  const space = useStageInfo((s) => s.space);
  // only while the machine is on screen, opened (never over the closed enclosure or the device)
  if (kind !== 'immersion' || !cutaway || scale !== 'tool' || space !== 'world') return null;
  return <ImmersionInset />;
}

function ImmersionInset() {
  const lightPath = useMagnifier((s) => s.lightPath);
  const marks = useRef<SVGGElement>(null);
  const light = useRef<SVGGElement>(null);
  const arrow = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    let last = magnifierFrame.waferZ;
    let dir = 0;
    const draw = () => {
      const z = magnifierFrame.waferZ;
      const dz = z - last;
      if (Math.abs(dz) > 1e-7) dir = dz > 0 ? 1 : -1;
      else dir = 0;
      last = z;
      const px = z * 1000 * TRAVEL;
      const off = ((px % PERIOD) + PERIOD) % PERIOD;
      marks.current?.setAttribute('transform', `translate(${off.toFixed(2)} 0)`);
      if (light.current) light.current.style.display = magnifierFrame.exposing ? '' : 'none';
      if (arrow.current) {
        arrow.current.style.display = dir === 0 ? 'none' : '';
        arrow.current.setAttribute('transform', dir < 0 ? 'translate(318 0) scale(-1 1)' : '');
      }
    };
    magnifierFrame.draw = draw;
    draw();
    return () => {
      if (magnifierFrame.draw === draw) magnifierFrame.draw = null;
    };
  }, []);

  // the marks on the wafer's surface (one period beyond each edge, so they slide in and out)
  const ticks: number[] = [];
  for (let x = -PERIOD; x < 280 + PERIOD; x += PERIOD) ticks.push(x);

  return (
    <figure
      className="mag"
      data-occludes
      aria-label="Magnified schematic: under the scanner's last lens element a film of water about a millimetre thick fills the gap to the wafer. The immersion hood around the lens feeds and removes the water, so it stays under the lens while the wafer moves."
    >
      <figcaption className="mag__head">
        <b>Magnified · schematic</b>
        <span>Under the last lens element</span>
      </figcaption>
      <svg viewBox="0 0 280 132" aria-hidden>
        <defs>
          <clipPath id="mag-wafer">
            <rect x={0} y={WY - 1.4} width={280} height={40} />
          </clipPath>
        </defs>
        {/* lens axis */}
        <line x1={26} y1={2} x2={26} y2={126} stroke="#b9bec5" strokeWidth={1} strokeDasharray="7 3 1.5 3" />
        {/* wafer on its chuck, resist-coated (the film is drawn as a line: 0.1 µm is far below this scale) */}
        <rect x={0} y={WY} width={280} height={24} fill="#8d939a" />
        <rect x={0} y={WY + 24} width={280} height={8} fill="#4c525a" />
        <rect x={0} y={WY - 1.4} width={280} height={1.4} fill="#b89a5b" />
        <g clipPath="url(#mag-wafer)">
          <g ref={marks}>
            {ticks.map((x) => (
              <rect key={x} x={x} y={WY - 1.4} width={9} height={1.4} fill="#7c6538" />
            ))}
          </g>
        </g>
        {/* water: under the lens, up the channel beside it, and under the hood out to the meniscus */}
        <path
          d={`M26 ${LENS_Y} L100 ${LENS_Y} L116 61.6 L132.4 61.6 L128 66 L110 ${HOOD_Y} L221 ${HOOD_Y} Q229 ${HOOD_Y + 5} 226 ${WY - 1.4} L26 ${WY - 1.4} Z`}
          fill="#8cc4e8"
          fillOpacity={0.62}
        />
        <path d={`M221 ${HOOD_Y} Q229 ${HOOD_Y + 5} 226 ${WY - 1.4}`} fill="none" stroke="#4f95c4" strokeWidth={1} />
        {/* last lens element (fused silica): flat underside, convex top */}
        <path d={`M26 ${LENS_Y} L100 ${LENS_Y} L120 58 L120 34 Q86 9 26 6 Z`} fill="#d9eaf6" stroke="#93b3ca" strokeWidth={1} />
        {/* lens barrel */}
        <path d="M112 4 H138 V48 L126 58 H120 V34 Q117 30 112 27 Z" fill="#a4acb5" />
        {/* immersion hood: supply channel onto the lens side, extraction at its outer edge */}
        <path d={`M142 26 H266 V${HOOD_Y - 6} Q266 ${HOOD_Y} 260 ${HOOD_Y} H110 L128 66 L138 56 Z`} fill="#5b636d" />
        <path d="M152 26 V44 L135 60" fill="none" stroke="#9dd0ef" strokeWidth={2.4} />
        <path d="M137 53 L134 60 L141 58" fill="none" stroke="#e8f4fb" strokeWidth={1.1} />
        <path d={`M214 ${HOOD_Y} V26`} fill="none" stroke="#9dd0ef" strokeWidth={2.4} />
        <path d="M210.5 36 L214 31 L217.5 36" fill="none" stroke="#e8f4fb" strokeWidth={1.1} />
        {/* 193 nm light: invisible; drawn only with the light-path overlay, while a field is exposed */}
        {lightPath && (
          <g ref={light}>
            <path d={`M26 8 L62 8 L54 ${LENS_Y} L46 ${WY - 1.4} L26 ${WY - 1.4} Z`} fill="#8a7dff" fillOpacity={0.3} />
            <text x={66} y={20} className="mag__minor" fill="#5f53c9" fontSize={8.5}>
              193 nm (invisible)
            </text>
          </g>
        )}
        {/* the gap, marked */}
        <path d={`M34 ${LENS_Y + 1.5} V${WY - 2.9} M31.5 ${LENS_Y + 4} L34 ${LENS_Y + 1.5} L36.5 ${LENS_Y + 4} M31.5 ${WY - 5.4} L34 ${WY - 2.9} L36.5 ${WY - 5.4}`} fill="none" stroke="#1f4f73" strokeWidth={1} />
        <text x={40} y={LENS_Y + 14.5} fill="#1f4f73" fontSize={10} fontWeight={600}>
          water ≈ 1 mm
        </text>
        <text x={34} y={44} className="mag__minor" fill="#4a6780" fontSize={9}>
          last lens element
        </text>
        <text x={160} y={44} className="mag__minor" fill="#eef1f4" fontSize={9}>
          immersion hood
        </text>
        <text x={100} y={WY + 15} className="mag__minor" fill="#f3f4f6" fontSize={9}>
          wafer
        </text>
        {/* the wafer's direction of travel */}
        <g ref={arrow}>
          <path d={`M142 ${WY + 12} H176 M170 ${WY + 8} L176 ${WY + 12} L170 ${WY + 16}`} fill="none" stroke="#f3f4f6" strokeWidth={1.3} />
        </g>
      </svg>
    </figure>
  );
}
