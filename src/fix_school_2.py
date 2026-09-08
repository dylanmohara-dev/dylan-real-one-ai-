with open('App.jsx', 'r') as f:
    content = f.read()

old2 = """      const [
        taskData,
        goalData,
        noteData,
        memoryData,
      ] = await Promise.all([
        request('/tasks'),
        request('/goals'),
        request('/notes'),
        request('/memories'),
      ])

      setTasks(taskData.tasks || [])
      setGoals(goalData.goals || [])
      setNotes(noteData.notes || [])
      setMemories(
        memoryData.memories || []
      )"""
new2 = """      const [
        taskData,
        goalData,
        noteData,
        memoryData,
        classData,
        assignmentData,
        testData,
      ] = await Promise.all([
        request('/tasks'),
        request('/goals'),
        request('/notes'),
        request('/memories'),
        request('/classes'),
        request('/assignments'),
        request('/tests'),
      ])

      setTasks(taskData.tasks || [])
      setGoals(goalData.goals || [])
      setNotes(noteData.notes || [])
      setMemories(
        memoryData.memories || []
      )
      setClasses(classData.classes || [])
      setAssignments(assignmentData.assignments || [])
      setTests(testData.tests || [])"""
assert content.count(old2) == 1, f"MISMATCH 2: found {content.count(old2)} times"
content = content.replace(old2, new2)

with open('App.jsx', 'w') as f:
    f.write(content)

print("PART 2 SUCCESS: loadData extended")
