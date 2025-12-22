
export const TEMPLATES = {
  kanban: {
    filename: 'KanbanBoard.tsx',
    content: `import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical, Maximize2 } from 'lucide-react';
import { createPortal } from 'react-dom';

// --- Types ---
export type Id = string | number;

export type Column = {
  id: Id;
  title: string;
};

export type Task = {
  id: Id;
  columnId: Id;
  content: string;
  priority: 'low' | 'medium' | 'high';
};

// --- Initial Data ---
const defaultCols: Column[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'doing', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

const initialTasks: Task[] = [
  { id: '1', columnId: 'todo', content: 'Design system architecture', priority: 'high' },
  { id: '2', columnId: 'todo', content: 'Research dnd-kit implementation', priority: 'medium' },
  { id: '3', columnId: 'doing', content: 'Initial project setup', priority: 'high' },
];

// --- Resize Handle Component ---
const ResizeHandle = ({ onResize }: { onResize: (delta: number) => void }) => {
  const [isDragging, setIsDragging] = useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const startX = e.clientX;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      onResize(moveEvent.clientX - startX);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      onMouseDown={onMouseDown}
      className={\`absolute top-0 -right-1 w-2 h-full cursor-col-resize z-20 group transition-all \${isDragging ? 'bg-blue-500/10' : ''}\`}
    >
      <div className={\`absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-all duration-300 \${
        isDragging 
          ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]' 
          : 'bg-slate-800 group-hover:bg-blue-400 group-hover:shadow-[0_0_8px_rgba(59,130,246,0.4)]'
      }\`} />
      
      {/* Visual Dot in the middle */}
      <div className={\`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-6 rounded-full transition-all duration-300 \${
        isDragging 
          ? 'bg-blue-500' 
          : 'bg-slate-700 opacity-0 group-hover:opacity-100 group-hover:bg-blue-400'
      }\`} />
    </div>
  );
};

// --- Task Card Component ---
const TaskCard = ({ task, isOverlay = false }: { task: Task; isOverlay?: boolean }) => {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'Task', task },
    disabled: isOverlay,
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  /**
   * REFINED: DragOverlay Styling
   * When isOverlay is true, we apply a deep shadow, a vibrant blue border,
   * a slight rotation, and a scale effect to make the item pop.
   */
  const overlayClasses = isOverlay 
    ? "shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] scale-[1.05] border-blue-500 ring-4 ring-blue-500/20 cursor-grabbing rotate-[2.5deg] bg-slate-800 shadow-blue-500/10 z-[1000]" 
    : "cursor-grab bg-slate-800 border-transparent shadow-lg";

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="opacity-20 bg-slate-700 h-[100px] min-h-[100px] rounded-xl border-2 border-dashed border-slate-600"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={\`p-4 h-[100px] min-h-[100px] flex flex-col justify-between text-left rounded-xl transition-all group border-2 relative \${overlayClasses}\`}
    >
      <p className="w-full overflow-hidden text-slate-200 text-sm font-medium line-clamp-3">
        {task.content}
      </p>
      <div className="flex items-center justify-between mt-auto">
        <div className={\`text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider
          \${task.priority === 'high' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 
            task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 
            'bg-green-500/20 text-green-500 border border-green-500/30'}\`}>
          {task.priority}
        </div>
        <div className="flex items-center gap-1">
            <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-slate-400" />
        </div>
      </div>
    </div>
  );
};

// --- Column Container Component ---
const ColumnContainer = ({ column, tasks, width, onResize }: { 
  column: Column; 
  tasks: Task[]; 
  width: number;
  onResize: (delta: number) => void;
}) => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'Column', column },
  });

  const style = { 
    transition, 
    transform: CSS.Translate.toString(transform),
    width: \`\${width}px\`
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-[calc(100vh-180px)] flex-col rounded-2xl bg-slate-900/40 backdrop-blur-md border border-slate-800 shadow-xl relative shrink-0"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between p-4 font-bold border-b border-slate-800 cursor-grab bg-slate-900/60 rounded-t-2xl"
      >
        <div className="flex gap-3 items-center text-slate-100">
          <span className="bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full text-xs font-mono border border-slate-700">{tasks.length}</span>
          <span className="truncate tracking-tight font-extrabold">{column.title}</span>
        </div>
        <button className="text-slate-500 hover:text-red-400 transition-colors p-1.5 hover:bg-red-400/10 rounded-lg">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-grow flex-col gap-4 p-4 overflow-y-auto custom-scrollbar">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>

      <button className="flex items-center justify-center gap-2 m-4 p-3 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-800 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
        <Plus size={16} /> Add Task
      </button>

      <ResizeHandle onResize={onResize} />
    </div>
  );
};

export default function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>(defaultCols);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<Id, number>>({
    'todo': 320,
    'doing': 320,
    'done': 320
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const onDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'Task') {
      setActiveTask(event.active.data.current.task);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveATask = active.data.current?.type === 'Task';
    const isOverATask = over.data.current?.type === 'Task';
    const isOverAColumn = over.data.current?.type === 'Column';

    if (isActiveATask && isOverATask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        
        if (tasks[activeIndex].columnId !== tasks[overIndex].columnId) {
          const newTasks = [...tasks];
          newTasks[activeIndex] = { ...newTasks[activeIndex], columnId: tasks[overIndex].columnId };
          return arrayMove(newTasks, activeIndex, overIndex);
        }

        return arrayMove(tasks, activeIndex, overIndex);
      });
    }

    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const newTasks = [...tasks];
        newTasks[activeIndex] = { ...newTasks[activeIndex], columnId: overId };
        return arrayMove(newTasks, activeIndex, activeIndex);
      });
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    if (active.id === over.id) return;

    const isActiveAColumn = active.data.current?.type === 'Column';
    if (!isActiveAColumn) return;

    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === active.id);
      const overColumnIndex = columns.findIndex((col) => col.id === over.id);
      return arrayMove(columns, activeColumnIndex, overColumnIndex);
    });
  };

  const handleResize = (id: Id, delta: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [id]: Math.min(Math.max(prev[id] + delta, 200), 600)
    }));
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 p-6 md:p-10 text-slate-200 overflow-hidden">
      <header className="mb-12 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent tracking-tighter">
            Symbiotic Boards
          </h1>
          <p className="text-slate-500 text-sm md:text-base mt-2 font-medium">Agile workflows reimagined for AI-driven development.</p>
        </div>
        <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center gap-3 transition-all shadow-xl shadow-indigo-600/20 active:scale-95 text-sm uppercase tracking-widest">
          <Plus size={20} /> New Column
        </button>
      </header>

      <div className="flex-1 overflow-x-auto pb-10 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-8 h-full min-w-max px-2">
            <SortableContext items={columns.map((col) => col.id)} strategy={horizontalListSortingStrategy}>
              {columns.map((col) => (
                <ColumnContainer
                  key={col.id}
                  column={col}
                  width={columnWidths[col.id] || 320}
                  onResize={(delta) => handleResize(col.id, delta)}
                  tasks={tasks.filter((t) => t.columnId === col.id)}
                />
              ))}
            </SortableContext>
          </div>

          {typeof document !== 'undefined' &&
            createPortal(
              <DragOverlay dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                  styles: {
                    active: {
                      opacity: '0.4',
                    },
                  },
                }),
              }}>
                {activeTask && <TaskCard task={activeTask} isOverlay />}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>
    </div>
  );
}`
  },
  login: {
    filename: 'Login.tsx',
    content: `import React, { useState } from 'react';
import { User, Lock, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-indigo-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <User className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
          <p className="text-indigo-200 mt-2">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email Address</label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" />
              <span className="text-gray-600">Remember me</span>
            </label>
            <a href="#" className="text-indigo-600 hover:text-indigo-700 font-medium">Forgot password?</a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-semibold hover:bg-black transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="animate-pulse">Signing in...</span>
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
        
        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Don't have an account? <a href="#" className="text-indigo-600 font-semibold hover:underline">Create one</a>
          </p>
        </div>
      </div>
    </div>
  );
}`
  },
  calculator: {
    filename: 'Calculator.tsx',
    content: `import React, { useState } from 'react';
import { Delete, Equal } from 'lucide-react';

export default function Calculator() {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState(true);

  const handleNumber = (num: string) => {
    if (newNumber) {
      setDisplay(num);
      setNewNumber(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleOperator = (op: string) => {
    const current = parseFloat(display);
    
    if (prevValue === null) {
      setPrevValue(current);
    } else if (operator) {
      const result = calculate(prevValue, current, operator);
      setPrevValue(result);
      setDisplay(String(result));
    }
    
    setOperator(op);
    setNewNumber(true);
  };

  const calculate = (a: number, b: number, op: string) => {
    switch(op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return a / b;
      default: return b;
    }
  };

  const handleEqual = () => {
    if (operator && prevValue !== null) {
      const current = parseFloat(display);
      const result = calculate(prevValue, current, operator);
      setDisplay(String(result));
      setPrevValue(null);
      setOperator(null);
      setNewNumber(true);
    }
  };

  const clear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setNewNumber(true);
  };

  const Button = ({ children, onClick, variant = 'default', className = '' }: any) => (
    <button
      onClick={onClick}
      className={\`
        h-16 rounded-2xl text-xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-sm
        \${variant === 'primary' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 
          variant === 'secondary' ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' :
          variant === 'accent' ? 'bg-orange-500 text-white hover:bg-orange-600' :
          'bg-gray-50 text-gray-900 hover:bg-gray-100 border border-gray-200'}
        \${className}
      \`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-sm bg-white p-6 rounded-[2rem] shadow-2xl border border-white/50">
        <div className="mb-6 px-4 py-8 bg-gray-900 rounded-3xl text-right shadow-inner">
          <span className="text-gray-400 text-sm h-6 block mb-1">
            {prevValue} {operator}
          </span>
          <span className="text-4xl text-white font-mono tracking-wider overflow-x-auto block">
            {display}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Button onClick={clear} variant="secondary" className="col-span-2 text-red-500">AC</Button>
          <Button onClick={() => handleNumber(display.substring(0, display.length -1))} variant="secondary"><Delete className="w-5 h-5" /></Button>
          <Button onClick={() => handleOperator('÷')} variant="accent">÷</Button>

          <Button onClick={() => handleNumber('7')}>7</Button>
          <Button onClick={() => handleNumber('8')}>8</Button>
          <Button onClick={() => handleNumber('9')}>9</Button>
          <Button onClick={() => handleOperator('×')} variant="accent">×</Button>

          <Button onClick={() => handleNumber('4')}>4</Button>
          <Button onClick={() => handleNumber('5')}>5</Button>
          <Button onClick={() => handleNumber('6')}>6</Button>
          <Button onClick={() => handleOperator('-')} variant="accent">-</Button>

          <Button onClick={() => handleNumber('1')}>1</Button>
          <Button onClick={() => handleNumber('2')}>2</Button>
          <Button onClick={() => handleNumber('3')}>3</Button>
          <Button onClick={() => handleOperator('+')} variant="accent">+</Button>

          <Button onClick={() => handleNumber('0')} className="col-span-2">0</Button>
          <Button onClick={() => handleNumber('.')}>.</Button>
          <Button onClick={handleEqual} variant="primary"><Equal className="w-6 h-6" /></Button>
        </div>
      </div>
    </div>
  );
}`
  },
  todo: {
    filename: 'TodoList.tsx',
    content: `import React, { useState } from 'react';
import { Plus, Check, Trash2, Calendar, Layout } from 'lucide-react';

export default function TodoApp() {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Review PRs from AI Team', completed: true, category: 'Work' },
    { id: 2, text: 'Update system documentation', completed: false, category: 'Docs' },
    { id: 3, text: 'Plan next sprint', completed: false, category: 'Planning' },
  ]);
  const [input, setInput] = useState('');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setTasks([...tasks, { 
      id: Date.now(), 
      text: input, 
      completed: false, 
      category: 'General' 
    }]);
    setInput('');
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: number) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const activeCount = tasks.filter(t => !t.completed).length;

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Layout className="w-32 h-32" />
          </div>
          <h1 className="text-3xl font-bold relative z-10">My Tasks</h1>
          <p className="text-indigo-100 mt-2 relative z-10 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm font-medium bg-white/10 w-fit px-3 py-1 rounded-full backdrop-blur-md">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {activeCount} tasks remaining
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {tasks.length === 0 ? (
             <div className="text-center py-10 text-gray-400">
               <p>All caught up! 🎉</p>
             </div>
          ) : tasks.map(task => (
            <div 
              key={task.id}
              className={\`group flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 hover:shadow-md \${task.completed ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100'}\`}
            >
              <button 
                onClick={() => toggleTask(task.id)}
                className={\`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors \${task.completed ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 hover:border-indigo-500'}\`}
              >
                {task.completed && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
              
              <div className="flex-1 min-w-0">
                <p className={\`text-sm font-medium truncate transition-all \${task.completed ? 'text-gray-400 line-through' : 'text-gray-700'}\`}>
                  {task.text}
                </p>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{task.category}</span>
              </div>

              <button 
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={addTask} className="p-4 bg-gray-50 border-t border-gray-100">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a new task..."
              className="w-full pl-5 pr-12 py-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-lg flex items-center justify-center transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}`
  },
  generic: {
    filename: 'Component.tsx',
    content: `import React from 'react';

export default function Component() {
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Generated Component</h1>
      <p className="text-gray-600">Start editing to see changes.</p>
    </div>
  );
}`
  }
};
