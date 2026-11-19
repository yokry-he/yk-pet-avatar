export class Emitter<M extends object> {
  #listeners = new Map<keyof M, Set<(event: never) => void>>()

  on<K extends keyof M>(type: K, listener: (event: M[K]) => void): () => void {
    let set = this.#listeners.get(type)
    if (!set) {
      set = new Set()
      this.#listeners.set(type, set)
    }
    set.add(listener as (event: never) => void)
    return () => set!.delete(listener as (event: never) => void)
  }

  emit<K extends keyof M>(type: K, event: M[K]): void {
    const set = this.#listeners.get(type)
    if (!set) return
    for (const listener of [...set]) listener(event as never)
  }

  clear(): void {
    this.#listeners.clear()
  }
}
