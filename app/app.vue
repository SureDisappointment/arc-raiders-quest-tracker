<script setup>
/**
 * Main application component (app.vue)
 *
 * This component serves as the root layout for the entire Nuxt application.
 * It sets up global <head> tags, defines the main site header,
 * and provides the <NuxtPage> component to render the current route.
 */

// --- Global Head Management ---

// useHead is used for managing <head> tags that are static for the entire site.
useHead({
  meta: [
    // Set the viewport for responsive behavior on mobile devices
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    // Set the site's favicon
    { rel: 'icon', href: 'favicon-128.ico' }
  ],
  htmlAttrs: {
    // Set the default language for the site for accessibility and SEO
    lang: 'en'
  }
})

// --- SEO & Social Meta ---

// Define base SEO metadata for the site.
const title = 'ARC Raiders Quest Tracker'
const description = 'Interactive quest progress tracker for ARC Raiders.'

// useSeoMeta provides a convenient way to set all relevant SEO and
// social sharing (Open Graph, Twitter) meta tags.
// These values are used as defaults but can be overridden by individual pages.
useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  // TODO: Replace with a dedicated social sharing image
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/starter-light.png',
  twitterImage: 'https://ui.nuxt.com/assets/templates/nuxt/starter-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <div class="h-screen w-screen">
    <UApp>
      <UHeader>
        <template #left>
          <NuxtLink to="/">
            <AppLogo class="w-auto h-6 shrink-0" />
          </NuxtLink>

          <TemplateMenu />
        </template>

        <template #right>
          <UColorModeButton />

          <UButton
            to="https://github.com/SureDisappointment/arc-raiders-quest-tracker"
            target="_blank"
            icon="i-simple-icons-github"
            aria-label="GitHub"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UHeader>

      <UMain class="h-[calc(100vh-var(--ui-header-height))]">
        <NuxtPage />
      </UMain>
    </UApp>
  </div>
</template>
