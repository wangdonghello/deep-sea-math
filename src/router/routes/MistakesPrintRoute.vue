<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import MistakePrintView from '@/views/MistakePrintView.vue'
import { getProductionStores } from '@/app/productionStores'
import { MASTERY_LEVELS, QUIZ_TYPES, type MasteryLevel, type QuizType } from '@/domain/model/types'
import type { MistakeFilterState } from '@/features/mistakeBook/types'

const route = useRoute()
const router = useRouter()
const stores = getProductionStores()

const rawType = route.query.type
const rawMastery = route.query.mastery
const type: QuizType | 'all' = typeof rawType === 'string' && (QUIZ_TYPES as readonly string[]).includes(rawType)
  ? rawType as QuizType
  : 'all'
const mastery: MasteryLevel | 'all' = typeof rawMastery === 'string' && (MASTERY_LEVELS as readonly string[]).includes(rawMastery)
  ? rawMastery as MasteryLevel
  : 'all'
const filter: MistakeFilterState = { type, masteryLevel: mastery }
</script>

<template>
  <MistakePrintView
    :store="stores.mistakes"
    :catalog="stores.mistakeCatalog"
    :filter="filter"
    @back="router.push('/mistakes')"
  />
</template>
