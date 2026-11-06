<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ChineseQuestView from '@/views/ChineseQuestView.vue'
import { getProductionStores } from '@/app/productionStores'
import { pickChineseDaily } from '@/domain/chinese/daily'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'
import grade1 from '@/data/content/chinese/grade1.json'
import grade2 from '@/data/content/chinese/grade2.json'
import grade3 from '@/data/content/chinese/grade3-challenge.json'
import grade4 from '@/data/content/chinese/grade4.json'
import grade5 from '@/data/content/chinese/grade5.json'
import grade6 from '@/data/content/chinese/grade6.json'
import passages1 from '@/data/content/chinese/passages.json'
import passages2 from '@/data/content/chinese/passages-grade2.json'
import passages3 from '@/data/content/chinese/passages-grade3-challenge.json'
import passages4 from '@/data/content/chinese/passages-grade4.json'
import passages5 from '@/data/content/chinese/passages-grade5.json'
import passages6 from '@/data/content/chinese/passages-grade6.json'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH, PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
const session = useProfileSessionStore()
const stores = getProductionStores()
const profileId = computed(() => session.activeProfileId ?? '')
const grade = ref(session.projection?.subjectGrades?.chinese ?? session.projection?.grade ?? 1)
const banks = [
  { questions: grade1.questions, passages: passages1 },
  { questions: grade2.questions, passages: passages2 },
  { questions: grade3.questions, passages: passages3 },
  { questions: grade4.questions, passages: passages4 },
  { questions: grade5.questions, passages: passages5 },
  { questions: grade6.questions, passages: passages6 },
] as const

const selected = computed(() => banks[Math.min(Math.max(grade.value, 1), 6) - 1])
const questions = computed(() => pickChineseDaily(selected.value.questions as ChineseQuestion[], 6))
const passageList = computed(() => selected.value.passages as ChinesePassage[])

onMounted(async () => {
  if (profileId.value === '') {
    void router.push(PROFILES_PATH)
    return
  }
  // 家长可能刚改过语文年级；以档案表为准，避免必须重新登录。
  const profile = await stores.storage.profiles.get(profileId.value)
  if (profile !== undefined) {
    grade.value = profile.subjectGrades?.chinese ?? profile.grade ?? 1
  }
})
</script>

<template>
  <ChineseQuestView
    v-if="profileId !== ''"
    :profile-id="profileId"
    :grade="grade"
    :store="stores.quiz"
    :questions="questions"
    :passages="passageList"
    @complete="router.push(HOME_PATH)"
    @exit="router.push(HOME_PATH)"
  />
</template>
