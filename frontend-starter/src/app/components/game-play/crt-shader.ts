import * as THREE from 'three';

const CRT_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const CRT_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uScreen;
  uniform float uTime;
  uniform float uScanlines;
  uniform float uPaused;
  uniform float uSignal;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    // Gentle barrel distortion inside UV space when CRT mode is enabled
    vec2 centered = vUv * 2.0 - 1.0;
    float r2 = dot(centered, centered);
    vec2 warped = centered * (1.0 + 0.032 * r2 * uScanlines);
    vec2 uv = warped * 0.5 + 0.5;

    // Dark CRT overscan mask outside [0, 1]
    float inBounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);

    // Subtle phosphor chromatic micro-shift near tube edges
    float ca = 0.0012 * uScanlines * (0.35 + r2);
    float r = texture2D(uScreen, clamp(uv + vec2(ca, 0.0), 0.0, 1.0)).r;
    float g = texture2D(uScreen, clamp(uv, 0.0, 1.0)).g;
    float b = texture2D(uScreen, clamp(uv - vec2(ca, 0.0), 0.0, 1.0)).b;
    vec3 col = vec3(r, g, b) * inBounds;

    // Warm up from a soft dark phosphor tube glow (linear RGB before colorspace_fragment)
    vec3 tubeBase = vec3(0.006, 0.009, 0.012);
    col = mix(tubeBase, col, uSignal);

    // Horizontal 240p scanlines + faint aperture grille tint
    float scan = 0.90 + 0.10 * sin(uv.y * 240.0 * 6.2831853 + uTime * 1.5);
    float grille = 0.97 + 0.03 * sin(uv.x * 320.0 * 6.2831853);
    col *= mix(1.0, scan * grille, uScanlines);

    // Subtle CRT corner vignette
    vec2 edge = smoothstep(0.0, 0.055, uv) * smoothstep(0.0, 0.055, 1.0 - uv);
    float vig = mix(1.0, edge.x * edge.y * (1.0 - 0.14 * r2), 0.75 * uScanlines + 0.25);
    col *= vig;

    // Gentle dim on pause
    col *= mix(1.0, 0.48, uPaused);

    // Subtle glass Fresnel reflection from the curved tube
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormalView), normalize(vViewDir)), 0.0, 1.0), 3.4);
    vec3 glassSheen = vec3(0.05, 0.07, 0.10) * fresnel * (0.45 + 0.45 * uScanlines);

    gl_FragColor = vec4(col + glassSheen, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface CrtShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uScreen: THREE.IUniform<THREE.CanvasTexture>;
  uTime: THREE.IUniform<number>;
  uScanlines: THREE.IUniform<number>;
  uPaused: THREE.IUniform<number>;
  uSignal: THREE.IUniform<number>;
}

/** Creates the custom CRT glass ShaderMaterial displaying the live emulator canvas texture. */
export function createCrtScreenMaterial(texture: THREE.CanvasTexture): THREE.ShaderMaterial {
  const uniforms: CrtShaderUniforms = {
    uScreen: { value: texture },
    uTime: { value: 0 },
    uScanlines: { value: 1.0 },
    uPaused: { value: 0.0 },
    uSignal: { value: 0.0 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CRT_VERTEX_SHADER,
    fragmentShader: CRT_FRAGMENT_SHADER,
    toneMapped: false,
  });
}
