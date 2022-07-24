# Flat-Folder: A Crease Pattern Solver

Flat-Folder is software written by [Jason S. Ku](http://jasonku.mit.edu/) to
compute and analyze valid flat-foldable states of flat-foldable crease patterns,
both assigned and unassigned. 

## How to use

1. Go to [Flat-Folder](https://origamimagiro.github.io/flat-folder/).
    - Tested to run in Chrome, Firefox, and Safari.
    - Chrome usually runs slightly faster than Firefox and much faster than Safari.
    - You should see the following interface:

    ![inital interface](./img/01.png)

1. Press "Upload" to upload a crease pattern in FOLD, SVG, OPX, or CP file formats.
    - The software will probably have trouble if points in the input file are
      not accurate to single-precision.
    - For SVG format:
        - the import assumes each imported line is an unassigned fold
          (assignment `"U"`), unless its `"style"` attribute contains a
          `"stroke"` whose value is one of `["red", "blue", "gray"]` 
          corresponding to `["M", "V", "F"]` assignments respectively;
        - will also accept values `["#FF0000", "#0000FF", "#808080"]`. 
    - For FOLD format: 
        - Import requires two properties:
            - `vertices_coords`
            - `edges_vertices`
        - Import can also import two optional properties: 
            - `edges_assignment` (if missing, will assume all edges are 
              unassigned `"U"`)
            - `faces_vertices` (if missing, will construct its own set of faces
              from the provided edges)
                - on import, will reorder faces to be increasing by area

1. Once uploaded, Flat-Folder will draw:
    - the crease pattern on left of the display,
    - an x-ray view of the folded crease pattern in the middle of the display, and
    - a red circle behind any vertex of the imported crease pattern that
      violates either Maekawa or Kawasaki's theorems.
        - For Kawasaki, it checks whether the ((sum of even angles) $- \pi$)
          is greater than `0.00001`.

    ![after import](./img/02.png)

    - Selecting the "Text" option will draw index labels for all the vertices,
      edges, and faces in the crease pattern. Currently, there is no way in the
      interface to adjust the font size, so this is only useful for debugging 
      small inputs or by manipulating the text later in an output SVG.

    ![showing text](./img/03.png)

1. Press "Fold" to find flat-foldable states of the crease pattern.
    - Flat-Folder will break up the faceOrder variables into disconnected 
      components of variables whose set of solutions are independently 
      assignable from each other.
    - You can limit the number of solutions to find per component by setting the
      "Limit" option:
        - `all` is defaut. This will attempt to compute all possible folded
          states.
        - Alternatively, you can select a number from [1, 10, 100, 1000], which
          will correspond to the maximum number of solutions to find per
          component.

5. After computing the overlap graph:
    - Flat-Folder will replace the x-ray view with the overlap graph.

    ![after folded](./img/04.png)

    - Selecting the "Text" option will now also draw index labels for all the 
      cells, segments, and points in the overlap graph.

    ![text after folded](./img/05.png)

    - Clicking on a cell in the overlap graph will highlight:
        - the faces of the crease pattern that overlap the cell (yellow), and
        - the edges of the crease pattern that overlap the segments bounding
          the cell.

    ![clicking a cell](./img/06.png)

    - Clicking on a face of the crease pattern will highlight:
        - the cells of the overlap graph that overlap the face (yellow),
        - the segments of the overlap graph that overlap the edges bounding
          the face, and
        - the other faces of the crease pattern that overlap the selected face
          in the folding (blue). Each blue face corresponds to a faceOrder
          variable (the yellow and blue faces overlap, so much be assigned an order).

    ![clicking a face](./img/07.png)

        - Clicking on one of the blue faces will highlight the
          features of the corresponding faceOrder variable:
            - its two faces (yellow),
            - its taco-taco constraints (green),
            - its taco-tortilla constraints (red),
            - its tortilla-tortilla constraints (orange), and
            - its transitivity constraints (blue).

    ![clicking two overlapping faces](./img/08.png)

6. After computing solutions for all components:
    - Flat-Folder will display how many valid flat-folded states were found.
    - If any states were found, Flat-Folder will draw a rendering of the first 
      one on the right of the display.

    ![after folded](./img/04.png)

    - Selecting the "Flip" option will redraw the folded state as seen from 
      the other side.

    ![clicking flip](./img/09.png)

    - A "Component" dropdown menu is added to aid in selecting other states.
        - The "none" option hides all display of component information.
        - The "all" option draws every component found on the overlap graph in a
          randomly assigned color.

    ![clicking all components](./img/10.png)

        - There is one numeric option (zero-indexed) for each component found.
          Selecting a component will:
            - draw that component on the overlap graph,
            - display the number of states found for that component, and
            - add a numeric input to enter which state to select for that
              component. 

    ![clicking a component](./img/11.png)

        - Changing this number will redraw the flat-folded state based on the
          change.

    ![changing a component](./img/12.png)

    - You can change states of each component until you reach a desired state.

    ![changing to a desired state](./img/13.png)

7. Press "Export" to generate export links to various outputs.
    - Clicking "cp" downloads the crease pattern in FOLD format.
    - Clicking "state" downloads the current folded state in FOLD format.
    - Clicking "img" downloads a snapshot of the current display in SVG format.
    - Clicking "log" downloads a text file of all console output since the most
      recent file was imported.

    ![export](./img/14.png)

## Algorithm

Existing software like ORIPA and Orihime/Oriedita find flat-foldable states by:

1. constructing an overlap graph of cells, where each cell is a maximal regions
   of points in the folded image that overlap the same set of crease pattern
   faces, and
2. finding an ordering of faces in each cell that avoids self-intersection of
   the paper.

Flat-Folder takes a different approach for step (2). 
