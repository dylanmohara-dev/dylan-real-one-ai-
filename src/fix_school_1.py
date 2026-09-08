with open('App.jsx', 'r') as f:
    content = f.read()

old1 = """  const [schoolInput, setSchoolInput] = useState('')
  const [schoolDueDate, setSchoolDueDate] = useState('')

  const [goalInput, setGoalInput] = useState('')"""
new1 = """  const [schoolInput, setSchoolInput] = useState('')
  const [schoolDueDate, setSchoolDueDate] = useState('')

  const [classes, setClasses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [tests, setTests] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(None)
  const [classNameInput, setClassNameInput] = useState('')
  const [assignmentInput, setAssignmentInput] = useState('')
  const [assignmentDueDate, setAssignmentDueDate] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testDate, setTestDate] = useState('')

  const [goalInput, setGoalInput] = useState('')"""
assert content.count(old1) == 1, f"MISMATCH 1: found {content.count(old1)} times"
content = content.replace(old1, new1)

with open('App.jsx', 'w') as f:
    f.write(content)

print("PART 1a SUCCESS: state added")
