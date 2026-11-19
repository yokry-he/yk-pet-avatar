import { defineYkPet, type YkPetElement } from '@yk-pet/element'
import type { PetConfig, RendererPreference, SayOptions, PetAction, Emotion, AgentState } from '@yk-pet/core'
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from 'react'

export interface YkPetHandle {
  say: (text: string, opts?: SayOptions) => ReturnType<YkPetElement['say']> | undefined
  play: (action: PetAction | string) => boolean
  setEmotion: (emotion: Emotion | string) => void
  lookAt: (x: number, y: number) => void
  setState: (state: AgentState | string) => boolean
  exportConfig: () => string
  element: () => YkPetElement | null
}

export interface YkPetProps {
  config?: Partial<PetConfig> | PetConfig
  preference?: RendererPreference
  className?: string
  style?: CSSProperties
  onReady?: (element: YkPetElement) => void
}

export const YkPet = forwardRef<YkPetHandle, YkPetProps>(function YkPet(props, ref) {
  const el = useRef<YkPetElement>(null)
  useEffect(() => { defineYkPet() }, [])
  useEffect(() => {
    if (el.current && props.config) el.current.config = props.config
  }, [props.config])
  useEffect(() => {
    if (el.current && props.preference) el.current.preference = props.preference
  }, [props.preference])
  useEffect(() => {
    if (el.current && props.onReady) props.onReady(el.current)
  }, [props.onReady])
  useImperativeHandle(ref, () => ({
    say: (text, opts) => el.current?.say(text, opts),
    play: action => el.current?.play(action) ?? false,
    setEmotion: emotion => el.current?.setEmotion(emotion),
    lookAt: (x, y) => el.current?.lookAt(x, y),
    setState: state => el.current?.setState(state) ?? false,
    exportConfig: () => el.current?.exportConfig() ?? '',
    element: () => el.current,
  }), [])
  return createElement('yk-pet', { ref: el, className: props.className, style: props.style })
})
