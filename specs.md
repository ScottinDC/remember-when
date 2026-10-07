# Remember When — Product Specification

## Purpose

Remember When is a private family oral-history app for recording and preserving a person's life story through a guided voice interview. It should feel like a thoughtful oral historian having a conversation, not a static questionnaire.

## Goal

Help a family preserve memories by asking meaningful follow-up questions based on earlier answers. The interview can continue as long as the participant wants and should naturally explore important stories in more depth.

## Core User Flow

1. An approved family member signs in to their private interview.
2. The interview begins with five foundational questions.
3. The participant records an audio answer for one question.
4. They may play it back, re-record it, or save it.
5. The saved answer is transcribed when processing is available.
6. The interview presents one thoughtful follow-up question connected to that answer.
7. The participant continues at their own pace, building a branching interview over time.

## Interview Archive

Each saved response keeps:

- The question it answers.
- The audio recording.
- The transcript when available.
- When it was recorded.
- Its connection to the previous question and answer.
- Optional interview metadata that helps organize the story.

The interview is a tree, not a flat list: a meaningful answer can lead to deeper related questions while preserving the path through the story.

## Recording Experience

- Answers may be up to five minutes long.
- Recording and stopping should be simple and obvious.
- The participant can play back a recording before saving.
- The participant can re-record an answer before saving it.
- The interface clearly shows whether an answer is ready, saved, processing, or needs attention.
- If later processing fails, a successfully saved recording must remain available.

## AI Interviewing Principles

The interviewer should behave like an experienced oral historian:

- Ask one question at a time.
- Prefer open-ended questions.
- Follow emotional or historically significant threads.
- Avoid repeating previous questions.
- Explore an interesting memory in more depth.
- Prioritize stories and personal meaning over a list of facts.
- Occasionally return to meaningful unanswered parts of life.

## Initial Biography

The first interview is designed around this background:

- Male, age 79, with Norwegian ancestry.
- Grew up in North Dakota with two older sisters.
- Father was an inventor; mother was a school teacher.
- Worked most of his career at Kodak.
- Lives in Centerville, Ohio, with his wife Christine.
- Five children, six grandchildren, and one great-grandchild.

Interests include family, travel, photography and cameras, trains, reading, history, politics, and visiting with friends.

## Initial Questions

1. When you look back over your life, what are the moments that made you who you are?
2. What are your earliest memories of growing up in North Dakota and your family?
3. What do you remember most about your parents, and what did they teach you?
4. How did your years at Kodak shape your life, both professionally and personally?
5. If your children, grandchildren, and great-grandchild could only know a handful of lessons from your life, what would you want them to remember?

## Privacy and Access

- The archive is private to explicitly approved family accounts.
- Each approved participant accesses only their own interview material.
- An unapproved account cannot view, add, change, or play private material.
- Access can be granted or revoked by a family administrator.

## User Experience

The interface is intentionally simple and appropriate for older adults:

- Large, readable text.
- Large, clearly labelled controls.
- Minimal distractions.
- A clear indication of progress through the interview.
- A visual view of the growing interview tree.

## Non-Goals

- Public profiles or public sharing of recordings.
- Collaborative editing of one person's interview by multiple accounts.
- Replacing original audio with generated or edited audio.
