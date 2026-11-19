import { defineYkPet, type YkPetElement } from '@yk-pet/element'
import type { AgentState, Emotion, PetAction, PetConfig, RendererPreference, SayOptions } from '@yk-pet/core'
import { defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'

export const YkPet = defineComponent({
  name: 'YkPet',
  props: {
    config: { type: Object as PropType<Partial<PetConfig> | PetConfig>, default: undefined },
    preference: { type: String as PropType<RendererPreference>, default: undefined },
  },
  emits: ['ready'],
  setup(props, { emit, expose }) {
    const el = ref<YkPetElement | null>(null)
    onMounted(() => {
      defineYkPet()
      if (el.value && props.config) el.value.config = props.config
      if (el.value && props.preference) el.value.preference = props.preference
      if (el.value) emit('ready', el.value)
    })
    watch(() => props.config, value => { if (el.value && value) el.value.config = value }, { deep: true })
    watch(() => props.preference, value => { if (el.value && value) el.value.preference = value })
    expose({
      say: (text: string, opts?: SayOptions) => el.value?.say(text, opts),
      play: (action: PetAction | string) => el.value?.play(action) ?? false,
      setEmotion: (emotion: Emotion | string) => el.value?.setEmotion(emotion),
      lookAt: (x: number, y: number) => el.value?.lookAt(x, y),
      setState: (state: AgentState | string) => el.value?.setState(state) ?? false,
      exportConfig: () => el.value?.exportConfig() ?? '',
    })
    return () => h('yk-pet', { ref: el })
  },
})
