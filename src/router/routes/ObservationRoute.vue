<script setup lang="ts">
/** Observation route adapter: translate view navigation events into router actions. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ObservationView from '@/views/ObservationView.vue'
import { HOME_PATH } from '@/router/nextRoute'
import type { CreatureContent } from '@/data/content/schema'

const route = useRoute()
const router = useRouter()
const creature = computed(() => route.meta.creature as CreatureContent)
</script>

<template>
  <ObservationView :creature="creature" @back-home="router.push(HOME_PATH)" />
</template>
