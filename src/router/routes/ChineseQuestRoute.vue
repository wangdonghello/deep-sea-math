<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import ChineseQuestView from '@/views/ChineseQuestView.vue'
import { getProductionStores } from '@/app/productionStores'
import { pickChineseDaily } from '@/domain/chinese/daily'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'
import grade1 from '@/data/content/chinese/grade1.json'
import grade2 from '@/data/content/chinese/grade2.json'
import grade3 from '@/data/content/chinese/grade3.json'
import passages1 from '@/data/content/chinese/passages.json'
import passages2 from '@/data/content/chinese/passages-grade2.json'
import passages3 from '@/data/content/chinese/passages-grade3.json'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH, PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
const session = useProfileSessionStore()
const stores = getProductionStores()
const profileId = computed(() => session.activeProfileId ?? '')
const grade = computed(() => session.projection?.subjectGrades?.chinese ?? session.projection?.grade ?? 1)
const questions = computed(() => {
  const bank = grade.value >= 3 ? grade3 : grade.value === 2 ? grade2 : grade1
  return pickChineseDaily(bank.questions as ChineseQuestion[], 6)
})
const passageList = computed(() => {
  const bank = grade.value >= 3 ? passages3 : grade.value === 2 ? passages2 : passages1
  return bank as ChinesePassage[]
})

onMounted(() => {
  if (profileId.value === '') void router.push(PROFILES_PATH)
})
</script>

<template>
  <ChineseQuestView
    v-if="profileId !== ''"
    :profile-id="profileId"
    :store="stores.quiz"
    :questions="questions"
    :passages="passageList"
    @complete="router.push(HOME_PATH)"
    @exit="router.push(HOME_PATH)"
  />
</template>
