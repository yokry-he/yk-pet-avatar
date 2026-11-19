# React

```tsx
import { useRef } from 'react'
import { YkPet, type YkPetHandle } from '@yk-pet/react'

export function DeskPet() {
  const pet = useRef<YkPetHandle>(null)
  return (
    <YkPet
      ref={pet}
      preference="auto"
      style={{ width: 280, height: 360 }}
      onReady={() => pet.current?.say('准备好了')}
    />
  )
}
```

`preference` 为 `auto` 时，支持 WebGL 会用 3D，否则降到 2D。命令式方法和 `<yk-pet>` 相同：`say`、`play`、`setEmotion`、`lookAt`、`setState`。
