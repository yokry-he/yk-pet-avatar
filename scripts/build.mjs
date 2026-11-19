import { build } from 'tsup'

const shared = { target: 'es2022', sourcemap: true, clean: true, treeshake: true }

const packages = [
  {
    name: 'core',
    entry: { index: 'packages/core/src/index.ts' },
    outDir: 'packages/core/dist',
    globalName: 'YkPetCore',
  },
  {
    name: '2d',
    entry: { index: 'packages/renderer-2d/src/index.ts' },
    outDir: 'packages/renderer-2d/dist',
    globalName: 'YkPet2D',
  },
  {
    name: '3d',
    entry: { index: 'packages/renderer-3d/src/index.ts' },
    outDir: 'packages/renderer-3d/dist',
    globalName: 'YkPet3D',
    external: [/^three($|\/)/, /^@yk-pet\//],
  },
  {
    name: 'element',
    entry: { index: 'packages/element/src/index.ts' },
    outDir: 'packages/element/dist',
    globalName: 'YkPet',
    external: [/^@yk-pet\//],
    noExternalIife: ['@yk-pet/core', '@yk-pet/2d'],
    iifeEntry: { 'yk-pet': 'packages/element/src/index.ts' },
  },
  {
    name: 'react',
    entry: { index: 'packages/react/src/index.tsx' },
    outDir: 'packages/react/dist',
    external: [/^react($|\/)/, /^react-dom($|\/)/, /^@yk-pet\//],
    iife: false,
  },
  {
    name: 'vue',
    entry: { index: 'packages/vue/src/index.ts' },
    outDir: 'packages/vue/dist',
    external: [/^vue($|\/)/, /^@yk-pet\//],
    iife: false,
  },
]

const only = process.argv[2]
for (const pkg of packages) {
  if (only && pkg.name !== only) continue
  await build({
    ...shared,
    entry: pkg.entry,
    format: ['esm', 'cjs'],
    dts: true,
    outDir: pkg.outDir,
    external: pkg.external,
    define: { __YK_PET_UMD__: 'false' },
    tsconfig: `packages/${pkg.name === '2d' ? 'renderer-2d' : pkg.name === '3d' ? 'renderer-3d' : pkg.name}/tsconfig.json`,
  })
  if (pkg.iife === false) continue
  await build({
    entry: pkg.iifeEntry ?? pkg.entry,
    format: ['iife'],
    globalName: pkg.globalName,
    outDir: pkg.outDir,
    clean: false,
    dts: false,
    sourcemap: false,
    target: 'es2022',
    noExternal: pkg.noExternalIife,
    external: pkg.name === 'element' ? ['@yk-pet/3d'] : pkg.name === '3d' ? [] : undefined,
    platform: 'browser',
    define: { __YK_PET_UMD__: pkg.name === 'element' ? 'true' : 'false' },
    tsconfig: `packages/${pkg.name === '2d' ? 'renderer-2d' : pkg.name === '3d' ? 'renderer-3d' : pkg.name}/tsconfig.json`,
    esbuildPlugins: pkg.name === 'element'
      ? [{
          name: 'external-yk-pet-3d',
          setup(build) {
            build.onResolve({ filter: /^@yk-pet\/3d$/ }, () => ({ path: '@yk-pet/3d', external: true }))
          },
        }]
      : [],
  })
}
