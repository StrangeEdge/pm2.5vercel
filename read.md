### core rules:
- Always read the codebase before making any changes.
- simplicity first: Make every changes as simple as possible. impact minimal code
- When adding new logic, always review the existing codebase first. Look for similar implementations and follow the same patterns. If the logic can be reused, use the existing implementation instead of creating a new one.
- never create unecessary html components that may cause conflict in css styling 
- find root causes. No temporary fixes. Senior developer standars
- Changes should only touch whats necessary. Avoid introducing bugs
- never put the css style inside the jsx file. put it inside its corresponding css file
- if somethings goes sideways, STOP and re-plan emmediately - dont keep pushing
- when ask a question without a to do instruction, just answer the question and dont edit the codebase
- preserve stable flows before replacing anything
- reuse shared helpers when logic repeats
- work in small slices only: one feature/flow/refactor at a time
- avoid duplicate ui primitives or parallel business logic
- if bugs or problem persist dont use same solution over and over, STOP then come up with new solution then implement it.
- always check the frontend for any error before marking the task complete
-when ask to create user or data for testing dont modify the codebase if necessary files are needed then cretae that outside of the codebase


### cross platform management
- When creating a new page or UI in the frontend, always ensure the design works well across all screen sizes, including mobile, tablet, and desktop. The layout should adjust properly so it remains usable and visually consistent on different devices

### strict rules:
- Never use emoji when using icons.
- apply the simpliest but most effective solution to the problems.
- if applicable reuse components to make the code cleaner and shorter. if not applicable dont reuse componenents.
- for design porposes dont make the components too compact or too close to each other.
- analyse all the picture and allign its design to the codebase.
- always follow “responsive design” or “responsive layout” design style.
- read relevant files, summarize understanding, list impacted files and risk before code completion.
- never mark a task complete without proving it works.
- read html components and its corresponding css style to match if it satisfied the instruction.




