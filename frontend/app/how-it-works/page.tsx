"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Box, Flex, Heading, Text, NativeSelect } from "@chakra-ui/react";
import { HOW_IT_WORKS, Lang } from "../translations";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Price Oracle";

export default function HowItWorksPage() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "vi" || saved === "en") {
        setLang(saved);
      }
    } catch {}
  }, []);

  function changeLang(l: Lang) {
    setLang(l);
    try {
      localStorage.setItem("lang", l);
    } catch {}
  }

  const content = HOW_IT_WORKS[lang];

  return (
    <Box maxW="100%" px={{ base: 4, md: 8 }} py={{ base: 4, md: 8 }} fontFamily="system-ui, sans-serif">
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
        <Box>
          <Heading size="lg">
            {APP_NAME} — {content.title}
          </Heading>
          <Link href="/">
            <Text color="blue.500" fontSize="sm" mt={1}>
              ← {lang === "en" ? "Back to dashboard" : "Về trang chính"}
            </Text>
          </Link>
        </Box>
        <NativeSelect.Root size="sm" width="76px">
          <NativeSelect.Field value={lang} onChange={(e) => changeLang(e.target.value as Lang)}>
            <option value="vi">VI</option>
            <option value="en">EN</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>

      <Flex direction={{ base: "column", md: "row" }} align="stretch" maxW="1100px" mt={10}>
        {content.steps.map((step, i) => (
          <Fragment key={step.title}>
            <Box
              flex="1"
              minW={{ base: "auto", md: "0" }}
              borderWidth="1px"
              borderColor="blue.200"
              bg="blue.50"
              borderRadius="lg"
              p={4}
              textAlign="center"
            >
              <Text fontSize="2xl" lineHeight="1" mb={2}>
                {step.icon}
              </Text>
              <Text fontWeight="semibold" fontSize="sm">
                {step.title}
              </Text>
              <Text fontSize="xs" color="gray.600" mt={1}>
                {step.caption}
              </Text>
            </Box>
            {i < content.steps.length - 1 && (
              <Flex align="center" justify="center" flexShrink={0} color="blue.300" fontWeight="bold" fontSize="xl" py={{ base: 1, md: 0 }} px={{ base: 0, md: 2 }}>
                <Text display={{ base: "none", md: "block" }}>→</Text>
                <Text display={{ base: "block", md: "none" }}>↓</Text>
              </Flex>
            )}
          </Fragment>
        ))}
      </Flex>

      <Text fontSize="sm" color="orange.700" mt={8} maxW="480px">
        {content.note}
      </Text>
    </Box>
  );
}
