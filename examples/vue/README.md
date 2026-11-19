# Vue 3

```vue
<script setup>
import { ref } from 'vue'
import { YkPet } from '@yk-pet/vue'

const pet = ref(null)
function hello() {
  pet.value?.say('你好')
}
</script>

<template>
  <YkPet ref="pet" preference="auto" style="width: 280px; height: 360px" @ready="hello" />
</template>
```
