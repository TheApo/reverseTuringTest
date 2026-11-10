import { describe, expect, it } from 'vitest'
import { AVATAR_PARTS, type AvatarPart } from '../server/game.ts'
import { DICT, type Key } from './i18n.ts'

const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('i18n', () => {
  it('nutzt in de und en dieselben Platzhalter', () => {
    for (const key of Object.keys(DICT.de) as Key[]) expect(vars(DICT.en[key]), key).toEqual(vars(DICT.de[key]))
  })

  it('hat für jede Avatar-Variante einen Namen in beiden Sprachen', () => {
    for (const part of Object.keys(AVATAR_PARTS) as AvatarPart[]) {
      for (let i = 0; i < AVATAR_PARTS[part]; i++) {
        const key = `avatar.${part}.${i}` as Key
        expect(DICT.de[key], key).toBeTruthy()
        expect(DICT.en[key], key).toBeTruthy()
      }
    }
  })
})
